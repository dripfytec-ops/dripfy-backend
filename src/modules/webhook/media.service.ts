import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly mediaDir = process.env.MEDIA_DIR || path.join(process.cwd(), 'media');

  constructor() {
    fs.mkdirSync(this.mediaDir, { recursive: true });
  }

  // Busca a URL temporária da mídia na Meta, baixa o arquivo e salva no volume.
  // Retorna a URL pública relativa (ex: /media/<uuid>.jpg) e o mime type.
  async downloadAndSave(mediaId: string, accessToken: string): Promise<{ url: string; mimeType: string } | null> {
    try {
      const infoRes = await axios.get(`https://graph.facebook.com/v20.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const { url: metaUrl, mime_type: mimeType } = infoRes.data;
      if (!metaUrl) return null;

      const fileRes = await axios.get(metaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
      });

      const ext = EXT_BY_MIME[mimeType] || (mimeType?.split('/')?.[1] ?? 'bin');
      const filename = `${randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(this.mediaDir, filename), fileRes.data);

      return { url: `/media/${filename}`, mimeType };
    } catch (e: any) {
      this.logger.error(`Falha ao baixar mídia ${mediaId}: ${e.message}`);
      return null;
    }
  }
}
