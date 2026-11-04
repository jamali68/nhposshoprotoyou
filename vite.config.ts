import fs from 'fs';
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

function githubPagesBundleSyncPlugin(): Plugin {
  return {
    name: 'github-pages-bundle-sync',
    closeBundle() {
      try {
        const rootDir = process.cwd();
        const distAssetsDir = path.resolve(rootDir, 'dist', 'assets');
        const distBundleDir = path.resolve(rootDir, 'dist-bundle');
        const distInnerBundleDir = path.resolve(rootDir, 'dist', 'dist-bundle');

        if (!fs.existsSync(distBundleDir)) {
          fs.mkdirSync(distBundleDir, { recursive: true });
        }
        if (!fs.existsSync(distInnerBundleDir)) {
          fs.mkdirSync(distInnerBundleDir, { recursive: true });
        }

        const jsSrc = path.resolve(distAssetsDir, 'app.js');
        const cssSrc = path.resolve(distAssetsDir, 'index.css');

        if (fs.existsSync(jsSrc)) {
          fs.copyFileSync(jsSrc, path.resolve(distBundleDir, 'app.js'));
          fs.copyFileSync(jsSrc, path.resolve(distInnerBundleDir, 'app.js'));
        }
        if (fs.existsSync(cssSrc)) {
          fs.copyFileSync(cssSrc, path.resolve(distBundleDir, 'index.css'));
          fs.copyFileSync(cssSrc, path.resolve(distInnerBundleDir, 'index.css'));
        }

        const publicSw = path.resolve(rootDir, 'public', 'sw.js');
        const rootSw = path.resolve(rootDir, 'sw.js');
        if (fs.existsSync(publicSw)) {
          fs.copyFileSync(publicSw, rootSw);
        }

        const official192 = path.resolve(rootDir, 'public', 'assets', 'aistudio', '1792729704800_2bd436ee.png');
        const official512 = path.resolve(rootDir, 'public', 'assets', 'aistudio', '1792729704800__1__bf19ca55.png');
        if (fs.existsSync(official192)) {
          for (const target of ['icon-192.png', 'icon.png', 'apple-touch-icon.png']) {
            fs.copyFileSync(official192, path.resolve(rootDir, target));
            fs.copyFileSync(official192, path.resolve(rootDir, 'dist', target));
          }
        }
        if (fs.existsSync(official512)) {
          for (const target of ['icon-512.png', 'icon1.png']) {
            fs.copyFileSync(official512, path.resolve(rootDir, target));
            fs.copyFileSync(official512, path.resolve(rootDir, 'dist', target));
          }
        }
      } catch (e) {
        console.warn('GitHub Pages bundle sync notice:', e);
      }
    }
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), netlifyFunctionsDevPlugin(), githubPagesBundleSyncPlugin()],
    build: {
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: 'assets/app.js',
          assetFileNames: 'assets/[name].[ext]'
        }
      }
    },
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
