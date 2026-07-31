import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import ffmpeg = require('fluent-ffmpeg');
import ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/amr': 'amr',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
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

      return { url: this.saveBuffer(fileRes.data, mimeType), mimeType };
    } catch (e: any) {
      this.logger.error(`Falha ao baixar mídia ${mediaId}: ${e.message}`);
      return null;
    }
  }

  // Salva um buffer (ex: áudio gravado no navegador, antes de mandar pra
  // Meta) direto no volume. Retorna a URL pública relativa.
  saveBuffer(buffer: Buffer, mimeType: string): string {
    const ext = EXT_BY_MIME[mimeType] || (mimeType?.split('/')?.[1]?.split(';')?.[0] ?? 'bin');
    const filename = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(this.mediaDir, filename), buffer);
    return `/media/${filename}`;
  }

  // O navegador grava em webm/opus, mas a WhatsApp Cloud API só aceita áudio
  // em ogg (só codec opus), aac, mp4, mpeg ou amr — webm dá "Media upload
  // error" na Meta. Reempacota o mesmo áudio opus num container ogg (rápido,
  // sem perda de qualidade real).
  async convertToOggOpus(buffer: Buffer): Promise<Buffer> {
    const tmpIn = path.join(os.tmpdir(), `${randomUUID()}.webm`);
    const tmpOut = path.join(os.tmpdir(), `${randomUUID()}.ogg`);
    fs.writeFileSync(tmpIn, buffer);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(tmpIn)
          .audioCodec('libopus')
          .audioChannels(1)
          // Opus só existe internamente a 48kHz — sem forçar isso aqui, a
          // frequência de captura do navegador (varia por SO/dispositivo)
          // pode ir pro encoder errada e o áudio sair mudo/distorcido na
          // Meta, mesmo com o arquivo tecnicamente válido.
          .audioFrequency(48000)
          .audioBitrate('64k')
          .outputOptions(['-vn', '-application', 'voip'])
          .format('ogg')
          .on('error', reject)
          .on('end', () => resolve())
          .save(tmpOut);
      });
      return fs.readFileSync(tmpOut);
    } finally {
      fs.rmSync(tmpIn, { force: true });
      fs.rmSync(tmpOut, { force: true });
    }
  }

  // Monta a URL pública completa (host do backend + caminho relativo) pra
  // mandar como "link" na API da Meta, que baixa o arquivo direto de lá.
  publicUrl(relativeUrl: string): string {
    const host = process.env.BACKEND_PUBLIC_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
      || 'http://localhost:3001';
    return host.replace(/\/$/, '') + relativeUrl;
  }
}
