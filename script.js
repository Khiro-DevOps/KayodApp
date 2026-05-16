const fs = require('fs');
const text = fs.readFileSync('c:/Users/keith/AppData/Roaming/Code/User/workspaceStorage/89c2cd397fd300472d538399a44bfbf5/GitHub.copilot-chat/chat-session-resources/47a5663f-f018-4856-86ec-90f9e6fcf642/call_MHxCaHhYbEVlRUt6eldrMmlxR3o__vscode-1778494628082/content.txt', 'utf-8');
const clientCode = text.split('\\\	sx')[1].split('\\\')[0].trim();
const actionCode = text.split('\\\	ypescript')[1].split('\\\')[0].trim();
fs.writeFileSync('app/(dashboard)/jobs/manage/new/new-job-form-client.tsx', clientCode);
fs.writeFileSync('app/(dashboard)/jobs/actions.ts', actionCode);
