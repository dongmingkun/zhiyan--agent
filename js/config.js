/**
 * GitHub Pages 版本：前端在 github.io，API 指向公网后端。
 * 如隧道地址变化，可在浏览器控制台执行：
 * localStorage.setItem('zhiyan_api_base', 'https://新地址')
 */
window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.API_BASE = localStorage.getItem('zhiyan_api_base') || 'https://planet-checkout-beside-dramatic.trycloudflare.com';
window.APP_CONFIG.PAGES_BUILD = true;
