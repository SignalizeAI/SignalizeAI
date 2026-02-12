export const byId = (id, root = document) => root.getElementById(id);

export const qs = (selector, root = document) => root.querySelector(selector);

export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const on = (element, eventName, handler, options) => {
  if (!element) return;
  element.addEventListener(eventName, handler, options);
};
