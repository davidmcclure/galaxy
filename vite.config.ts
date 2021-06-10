
import { defineConfig } from 'vite'
import reactRefresh from '@vitejs/plugin-react-refresh'

// https://vitejs.dev/config/
export default defineConfig({
  root: './examples',
  plugins: [reactRefresh()],
  build: {
    rollupOptions: {
      input: {
        dev: './examples/dev/index.html',
      }
    }
  }
})
