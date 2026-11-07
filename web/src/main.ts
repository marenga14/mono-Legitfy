import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./lib/i18n";
import { reveal } from "./lib/reveal";
import { router } from "./router";
import "./style.css";

createApp(App).use(i18n).use(router).directive("reveal", reveal).mount("#app");
