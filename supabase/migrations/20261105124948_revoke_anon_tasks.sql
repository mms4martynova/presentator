/*
# Revoke anon access to tasks table

## Purpose
The tasks table should only be accessible to authenticated users.
The anon role currently has CRUD grants that were not explicitly granted
(likely from a default). Revoke them to ensure unauthenticated users
cannot access task data.
*/

REVOKE SELECT, INSERT, UPDATE, DELETE ON tasks FROM anon;
