import App from './App.svelte';
import './index.css';
import { mount } from 'svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Missing element: #app');
}

mount(App, { target });
