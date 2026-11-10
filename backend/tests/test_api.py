from io import BytesIO

from pptx import Presentation


def _pptx_bytes() -> bytes:
    buffer = BytesIO()
    Presentation().save(buffer)
    return buffer.getvalue()


def _create_task(client, **overrides):
    body = {
        "title": "Отчет за квартал",
        "text": "# Продажи\n- рост на 12%\n- новые клиенты\n\n# Регионы\n- Москва\n- Казань",
        "slides_count": 3,
        "mode": "sync",
    }
    body.update(overrides)
    return client.post("/api/v1/tasks", json=body)


def test_requires_api_key(client):
    client.headers.pop("X-API-Key")
    assert client.get("/api/v1/tasks").status_code == 401


def test_sync_generation_and_download(client):
    response = _create_task(client)
    assert response.status_code == 200
    task = response.json()
    assert task["status"] == "completed"
    assert task["outline"] and task["outline"][0]["type"] in {
        "text",
        "table",
        "chart",
        "comparison",
        "image",
    }

    pptx = client.get(f"/api/v1/tasks/{task['id']}/result", params={"format": "pptx"})
    assert pptx.status_code == 200
    assert len(Presentation(BytesIO(pptx.content)).slides) == 1 + len(task["outline"])
    assert (
        client.get(f"/api/v1/tasks/{task['id']}/result", params={"format": "pdf"}).status_code
        == 404
    )


def test_async_returns_accepted_with_id(client):
    response = client.post(
        "/api/v1/tasks", json={"title": "Async", "text": "Тема\n- тезис", "slides_count": 2}
    )
    assert response.status_code == 202
    assert response.json()["status"] == "queued"


def test_sync_mode_rejects_large_decks(client):
    assert _create_task(client, slides_count=10).status_code == 422


def test_rebuild_reuses_outline_for_render_only_changes(client):
    parent = _create_task(client).json()
    rebuilt = client.post(
        f"/api/v1/tasks/{parent['id']}/rebuild", json={"title": "Другое название"}
    )
    assert rebuilt.status_code == 202
    body = rebuilt.json()
    assert body["parent_task_id"] == parent["id"]
    assert body["outline"] == parent["outline"]
    assert body["title"] == "Другое название"


def test_rebuild_with_new_slide_count_regenerates_outline(client):
    parent = _create_task(client).json()
    rebuilt = client.post(f"/api/v1/tasks/{parent['id']}/rebuild", json={"slides_count": 1})
    assert rebuilt.status_code == 202
    assert rebuilt.json()["outline"] is None


def test_history_lists_own_tasks(client):
    _create_task(client)
    history = client.get("/api/v1/tasks").json()
    assert history and "status" in history[0]


def test_other_users_cannot_see_tasks(client, other_client):
    task = _create_task(client).json()
    assert other_client.get(f"/api/v1/tasks/{task['id']}").status_code == 404
    assert other_client.get("/api/v1/tasks").json() == []


def test_template_upload_versions_and_activation(client):
    created = client.post(
        "/api/v1/templates",
        data={"name": "Корпоративный"},
        files={
            "file": (
                "brand.pptx",
                _pptx_bytes(),
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            )
        },
    )
    assert created.status_code == 201
    template = created.json()
    assert [v["version"] for v in template["versions"]] == [1]

    second = client.post(
        f"/api/v1/templates/{template['id']}/versions",
        files={"file": ("brand-v2.pptx", _pptx_bytes(), "application/octet-stream")},
    )
    assert [v["is_active"] for v in second.json()["versions"]] == [False, True]

    rolled_back = client.post(
        f"/api/v1/templates/{template['id']}/versions/{template['versions'][0]['id']}/activate"
    )
    assert [v["is_active"] for v in rolled_back.json()["versions"]] == [True, False]


def test_template_rejects_non_pptx_and_invalid_content(client):
    bad_name = client.post(
        "/api/v1/templates",
        data={"name": "x"},
        files={"file": ("doc.docx", b"abc", "application/octet-stream")},
    )
    assert bad_name.status_code == 422
    bad_content = client.post(
        "/api/v1/templates",
        data={"name": "x"},
        files={"file": ("broken.pptx", b"abc", "application/octet-stream")},
    )
    assert bad_content.status_code == 422


def test_generation_with_template_uses_it(client):
    template = client.post(
        "/api/v1/templates",
        data={"name": "Шаблон"},
        files={"file": ("t.pptx", _pptx_bytes(), "application/octet-stream")},
    ).json()
    task = _create_task(client, template_id=template["id"]).json()
    assert task["template_version_id"] == template["versions"][0]["id"]
    assert task["status"] == "completed"


# ─── MCP Streamable HTTP tests ───────────────────────────────────────────


def _mcp_init(client):
    init = client.post(
        "/api/v1/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    )
    assert init.json()["result"]["serverInfo"]["name"] == "presentator"
    session_id = init.headers.get("Mcp-Session-Id")
    assert session_id
    return session_id


def test_mcp_initialize_list_and_generate(client):
    session_id = _mcp_init(client)

    tools = client.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        headers={"Mcp-Session-Id": session_id},
    ).json()
    assert {tool["name"] for tool in tools["result"]["tools"]} >= {
        "generate_presentation",
        "get_result",
        "recommend_visualization",
        "analyze_presentation",
    }

    call = client.post(
        "/api/v1/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "generate_presentation",
                "arguments": {"title": "Из MCP", "text": "Тема\n- тезис"},
            },
        },
        headers={"Mcp-Session-Id": session_id},
    ).json()
    assert call["result"]["isError"] is False
    assert "task_id" in call["result"]["content"][0]["text"]


def test_mcp_recommend_visualization(client):
    session_id = _mcp_init(client)

    rec = client.post(
        "/api/v1/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "recommend_visualization",
                "arguments": {
                    "title": "Продажи по кварталам",
                    "bullets": ["Q1: 100", "Q2: 120", "Q3: 90"],
                },
            },
        },
        headers={"Mcp-Session-Id": session_id},
    ).json()
    content = rec["result"]["content"][0]["text"]
    assert "visualization" in content
    assert "reasoning" in content


def test_mcp_analyze_presentation(client):
    session_id = _mcp_init(client)

    analysis = client.post(
        "/api/v1/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "analyze_presentation",
                "arguments": {
                    "text": "Динамика продаж\n- рост на 12%\n- снижение затрат",
                    "audience": "совет директоров",
                    "tone": "деловой",
                },
            },
        },
        headers={"Mcp-Session-Id": session_id},
    ).json()
    content = analysis["result"]["content"][0]["text"]
    assert "trend_mentions" in content
    assert "audience" in content


def test_mcp_ping(client):
    session_id = _mcp_init(client)

    pong = client.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "id": 2, "method": "ping"},
        headers={"Mcp-Session-Id": session_id},
    ).json()
    assert pong["result"]["status"] == "pong"


def test_mcp_rejects_request_without_session(client):
    response = client.post(
        "/api/v1/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    )
    assert response.status_code == 400


def test_mcp_notification_returns_accepted(client):
    session_id = _mcp_init(client)
    response = client.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        headers={"Mcp-Session-Id": session_id},
    )
    assert response.status_code == 204


def test_mcp_delete_session(client):
    session_id = _mcp_init(client)
    response = client.delete("/api/v1/mcp", headers={"Mcp-Session-Id": session_id})
    assert response.status_code == 204

    after = client.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        headers={"Mcp-Session-Id": session_id},
    )
    assert after.status_code == 400
