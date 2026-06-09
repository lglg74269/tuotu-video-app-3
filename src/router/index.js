import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import WorkflowView from '../views/WorkflowView.vue';
import SettingsView from '../views/SettingsView.vue';

const routes = [
  { path: '/', component: HomeView },
  { path: '/workflow/:id', component: WorkflowView },
  { path: '/settings', component: SettingsView }
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes
});
