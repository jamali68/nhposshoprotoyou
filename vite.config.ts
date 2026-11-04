import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { pathToFileURL } from 'url';
import { defineConfig, Plugin } from 'vite';

function netlifyFunctionsDevPlugin(): Plugin {
  return {
    name: 'netlify-functions-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url?.split('?')[0] || '';
        const fnMap: Record<string, string> = {
          '/.netlify/functions/auth': 'netlify/functions/auth.js',
          '/api/auth': 'netlify/functions/auth.js',
          '/.netlify/functions/send-otp': 'netlify/functions/send-otp.js',
          '/api/send-otp': 'netlify/functions/send-otp.js',
          '/.netlify/functions/api': 'netlify/functions/api.js',
          '/api/api': 'netlify/functions/api.js'
        };

        const targetRelativePath = fnMap[rawUrl];
        if (targetRelativePath) {
          try {
            const absFileUrl = pathToFileURL(path.resolve(process.cwd(), targetRelativePath)).href;
            const { handler } = await import(absFileUrl);
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', async () => {
              const event = {
                httpMethod: req.method || 'POST',
                headers: req.headers,
                body: body || '{}',
                queryStringParameters: {}
              };
              const result = await handler(event);
              res.statusCode = result.statusCode || 200;
              if (result.headers) {
                for (const [k, v] of Object.entries(result.headers)) {
                  res.setHeader(k, v as string);
                }
              }
              res.end(result.body);
            });
            return;
          } catch (err: any) {
            console.error('Error in dev Netlify function handler:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), netlifyFunctionsDevPlugin()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve('.'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client'],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
