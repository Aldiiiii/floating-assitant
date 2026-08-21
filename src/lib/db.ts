import Database from "@tauri-apps/plugin-sql";

export interface ConversationRow {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  dbPromise ??= Database.load("sqlite:assistant.db");
  return dbPromise;
}

export const db = {
  async listConversations(): Promise<ConversationRow[]> {
    const d = await getDb();
    return d.select<ConversationRow[]>(
      "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC, id DESC",
    );
  },

  async createConversation(title = "Percakapan baru"): Promise<ConversationRow> {
    const d = await getDb();
    const res = await d.execute("INSERT INTO conversations (title) VALUES ($1)", [title]);
    const id = Number(res.lastInsertId);
    return this.getConversation(id);
  },

  async getConversation(id: number): Promise<ConversationRow> {
    const d = await getDb();
    const rows = await d.select<ConversationRow[]>(
      "SELECT id, title, created_at, updated_at FROM conversations WHERE id = $1",
      [id],
    );
    if (rows.length === 0) throw new Error(`Conversation ${id} tidak ditemukan`);
    return rows[0];
  },

  async renameConversation(id: number, title: string): Promise<void> {
    const d = await getDb();
    await d.execute("UPDATE conversations SET title = $2 WHERE id = $1", [id, title]);
  },

  async touchConversation(id: number): Promise<void> {
    const d = await getDb();
    await d.execute(
      "UPDATE conversations SET updated_at = datetime('now', 'localtime') WHERE id = $1",
      [id],
    );
  },

  async deleteConversation(id: number): Promise<void> {
    const d = await getDb();
    await d.execute("DELETE FROM messages WHERE conversation_id = $1", [id]);
    await d.execute("DELETE FROM conversations WHERE id = $1", [id]);
  },

  async clearAllConversations(): Promise<void> {
    const d = await getDb();
    await d.execute("DELETE FROM messages", []);
    await d.execute("DELETE FROM conversations", []);
  },

  async getMessages(conversationId: number): Promise<MessageRow[]> {
    const d = await getDb();
    return d.select<MessageRow[]>(
      "SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY id ASC",
      [conversationId],
    );
  },

  async addMessage(
    conversationId: number,
    role: "user" | "assistant",
    content: string,
  ): Promise<number> {
    const d = await getDb();
    const res = await d.execute(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)",
      [conversationId, role, content],
    );
    return Number(res.lastInsertId);
  },
};
