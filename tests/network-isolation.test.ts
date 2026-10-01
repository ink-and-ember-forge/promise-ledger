import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('network isolation', () => {
  it('fails any fetch / XHR / WebSocket / EventSource attempt', async () => {
    expect(() => fetch('https://example.com')).toThrow(/Network access attempted/);
    expect(() => new XMLHttpRequest()).toThrow(/Network access attempted/);
    expect(() => new WebSocket('wss://example.com')).toThrow(/Network access attempted/);
    expect(() => new EventSource('/x')).toThrow(/Network access attempted/);
  });

  it('ships a strict CSP with connect-src none', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("connect-src 'none'");
  });

  it('source code contains no network APIs or remote URLs', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|css|html)$/.test(p) && !p.endsWith('.test.ts')) files.push(p);
      }
    };
    walk('src');
    files.push('index.html');
    const forbidden = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b|https?:\/\//;
    for (const f of files) {
      const hit = readFileSync(f, 'utf8').split('\n').findIndex((l: string) => forbidden.test(l));
      expect(hit, `${f} line ${hit + 1} uses a network API or remote URL`).toBe(-1);
    }
  });
});
