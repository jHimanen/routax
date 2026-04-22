import type { StoredObjectRef } from "../types/storage";

export interface StorageProvider {
  putObject(key: string, body: Buffer, contentType: string): Promise<StoredObjectRef>;
  getObject(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
