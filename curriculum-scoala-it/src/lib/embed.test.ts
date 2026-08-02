import { describe, expect, it } from 'vitest';
import { toEmbedUrl } from './embed';

describe('toEmbedUrl', () => {
  it('gol/lipsa -> null', () => {
    expect(toEmbedUrl('')).toBeNull();
  });

  it('link scurt youtu.be -> embed', () => {
    expect(toEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('link normal youtube.com/watch?v= -> embed', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('link deja de tip embed ramane neschimbat', () => {
    const url = 'https://www.youtube.com/embed/abc123';
    expect(toEmbedUrl(url)).toBe(url);
  });

  it('link vimeo -> player embed', () => {
    expect(toEmbedUrl('https://vimeo.com/12345')).toBe('https://player.vimeo.com/video/12345');
  });

  it('youtube.com fara parametrul "v" (ex: playlist) -> null, nu link brut neembeddabil', () => {
    expect(toEmbedUrl('https://www.youtube.com/playlist?list=xyz')).toBeNull();
  });

  it('SECURITATE (audit M-5): host necunoscut/neinclus in lista -> null, nu URL-ul brut', () => {
    expect(toEmbedUrl('https://evil.example.com/phishing')).toBeNull();
  });

  it('SECURITATE (audit M-5): schema javascript: -> null, niciodata randata in iframe', () => {
    expect(toEmbedUrl('javascript:alert(1)')).toBeNull();
  });

  it('SECURITATE: doar http/https sunt acceptate ca protocol', () => {
    expect(toEmbedUrl('ftp://example.com/video.mp4')).toBeNull();
    expect(toEmbedUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('text care nu e deloc un URL valid -> null, fara sa arunce eroare', () => {
    expect(toEmbedUrl('nu sunt un link')).toBeNull();
  });
});
