<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { persistLocale, type AppLocale } from "./i18n";

const { locale, t } = useI18n();
const count = ref(0);

const otherLocale = computed<AppLocale>(() =>
  locale.value === "zh" ? "en" : "zh"
);

function toggleLocale() {
  locale.value = otherLocale.value;
}

// Keep <html lang> and localStorage in sync with the active locale.
watchEffect(() => {
  const current = locale.value as AppLocale;
  persistLocale(current);
  if (typeof document !== "undefined") {
    document.documentElement.lang = current === "zh" ? "zh-CN" : "en";
  }
});
</script>

<template>
  <main class="app">
    <button
      type="button"
      class="lang-switch"
      :aria-label="t('app.switch')"
      @click="toggleLocale"
    >
      {{ t("app.switch") }}
    </button>

    <h1>Vite + Vue 3</h1>
    <p class="subtitle">{{ t("app.subtitle") }}</p>
    <button type="button" @click="count++">
      {{ t("app.count", { count }) }}
    </button>
    <p class="hint">
      <i18n-t keypath="app.hint" tag="span">
        <code>src/App.vue</code>
      </i18n-t>
    </p>
  </main>
</template>

<style scoped>
.app {
  position: relative;
  max-width: 560px;
  margin: 80px auto;
  padding: 24px;
  text-align: center;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.lang-switch {
  position: absolute;
  top: 0;
  right: 0;
  background: transparent;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: color 150ms, border-color 150ms;
}

.lang-switch:hover {
  color: #1f2937;
  border-color: #1f2937;
}

h1 {
  font-size: 2.5rem;
  margin: 0 0 8px;
}

.subtitle {
  color: #6b7280;
  margin: 0 0 32px;
}

button:not(.lang-switch) {
  background: #10b981;
  color: white;
  border: 0;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
}

button:not(.lang-switch):hover {
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
