import { spawn, type ChildProcess } from 'node:child_process';

export interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

export class HeadlessBrowser {
  private process: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();
  public consoleErrors: string[] = [];
  public uncaughtExceptions: string[] = [];
  public isReady = false;

  async launch(chromiumPath = '/usr/bin/chromium'): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '--headless',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--remote-debugging-port=0',
        '--user-data-dir=/tmp/chromium-e2e-' + Date.now(),
        'about:blank',
      ];

      this.process = spawn(chromiumPath, args);
      let timer: NodeJS.Timeout | null = null;
      let handled = false;

      const onData = async (data: Buffer) => {
        const text = data.toString();
        const match = text.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (match && !handled) {
          handled = true;
          const port = match[1];
          try {
            // Give chromium 150ms to register about:blank page
            await new Promise((r) => setTimeout(r, 200));
            const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
            const pages: any[] = await listRes.json();
            const pageTarget = pages.find((p) => p.type === 'page') || pages[0];
            if (!pageTarget?.webSocketDebuggerUrl) {
              throw new Error('No valid page target found in /json/list');
            }
            await this.connectWs(pageTarget.webSocketDebuggerUrl);
            if (timer) clearTimeout(timer);
            this.isReady = true;
            resolve();
          } catch (err) {
            reject(err);
          }
        }
      };

      this.process.stderr?.on('data', onData);
      this.process.stdout?.on('data', onData);

      this.process.on('error', (err) => {
        if (timer) clearTimeout(timer);
        reject(new Error(`Failed to spawn Chromium: ${err.message}`));
      });

      this.process.on('exit', (code) => {
        if (!this.isReady) {
          if (timer) clearTimeout(timer);
          reject(new Error(`Chromium exited early with code ${code}`));
        }
      });

      timer = setTimeout(() => {
        if (!this.isReady) {
          this.close();
          reject(new Error('Timed out waiting for Chromium CDP port'));
        }
      }, 7000);
    });
  }

  private async connectWs(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = async () => {
        try {
          await this.send('Page.enable');
          await this.send('Runtime.enable');
          await this.send('Console.enable');
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      ws.onerror = (evt) => {
        reject(new Error(`WebSocket error: ${String(evt)}`));
      };

      ws.onmessage = (event) => {
        try {
          const msg: CdpMessage = JSON.parse(event.data as string);
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const req = this.pendingRequests.get(msg.id)!;
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              req.reject(new Error(msg.error.message));
            } else {
              req.resolve(msg.result);
            }
            return;
          }

          if (msg.method === 'Runtime.exceptionThrown') {
            const exc = msg.params?.exceptionDetails as any;
            const text = exc?.exception?.description || exc?.text || 'Uncaught Exception';
            this.uncaughtExceptions.push(text);
          } else if (msg.method === 'Console.messageAdded') {
            const entry = msg.params?.message as any;
            if (entry?.level === 'error') {
              this.consoleErrors.push(entry.text || '');
            }
          }
        } catch {}
      };
    });
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    const id = ++this.messageId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string): Promise<void> {
    await this.send('Page.navigate', { url });
    // Wait for load event or short settle
    await new Promise((r) => setTimeout(r, 600));
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(`Eval failed: ${res.exceptionDetails.text || res.exceptionDetails.exception?.description}`);
    }
    return res?.result?.value;
  }

  async waitForSelector(selector: string, timeoutMs = 4000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (found) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  async click(selector: string): Promise<boolean> {
    const clicked = await this.evaluate<boolean>(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.click();
        return true;
      })()
    `);
    return Boolean(clicked);
  }

  async getText(selector: string): Promise<string | null> {
    return this.evaluate<string | null>(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        return el ? (el.textContent || '').trim() : null;
      })()
    `);
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
        setTimeout(() => {
          try {
            this.process?.kill('SIGKILL');
          } catch {}
        }, 500);
      } catch {}
      this.process = null;
    }
  }
}
