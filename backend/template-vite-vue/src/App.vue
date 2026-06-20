<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
</script>

<template>
  <main class="app">
    <h1>Vite + Vue 3</h1>
    <p class="subtitle">极简版模板 — 启动快、占用低</p>
    <button type="button" @click="count++">count is {{ count }}</button>
    <p class="hint">
      Edit <code>src/App.vue</code> to get started.
    </p>
  </main>
</template>

<style scoped>
.app {
  max-width: 560px;
  margin: 80px auto;
  padding: 24px;
  text-align: center;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

h1 {
  font-size: 2.5rem;
  margin: 0 0 8px;
}

.subtitle {
  color: #6b7280;
  margin: 0 0 32px;
}

button {
  background: #10b981;
  color: white;
  border: 0;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
}

button:hover {
  background: #059669;
}

.hint {
  margin-top: 32px;
  color: #9ca3af;
  font-size: 0.875rem;
}

code {
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
