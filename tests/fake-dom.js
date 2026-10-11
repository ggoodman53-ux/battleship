'use strict';

function kebabCase(value) {
  return value.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); });
}

function parseAttributes(source, element) {
  const attributes = source.match(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g) || [];
  attributes.forEach(function (entry) {
    const match = entry.match(/^([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?$/);
    if (match) element.setAttribute(match[1], match[2] || match[3] || match[4] || '');
  });
}

function parseMarkup(markup, parent, document) {
  const stack = [parent];
  const tokens = String(markup).match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g) || [];
  tokens.forEach(function (token) {
    if (token.slice(0, 4) === '<!--' || token.slice(0, 2) === '<!') return;
    if (token.slice(0, 2) === '</') {
      const name = token.slice(2).match(/^([^\s>]+)/);
      if (!name) return;
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tagName === name[1].toUpperCase()) {
          stack.length = i;
          break;
        }
      }
      return;
    }
    if (token.charAt(0) !== '<') {
      const current = stack[stack.length - 1];
      current._text += token;
      return;
    }
    const opening = token.match(/^<([^\s/>]+)([\s\S]*?)\/?>$/);
    if (!opening) return;
    const element = document.createElement(opening[1]);
    parseAttributes(opening[2], element);
    stack[stack.length - 1].appendChild(element);
    if (!/^(AREA|BASE|BR|COL|EMBED|HR|IMG|INPUT|LINK|META|PARAM|SOURCE|TRACK|WBR)$/.test(element.tagName) &&
        !/\/>$/.test(token)) stack.push(element);
  });
}

class FakeEvent {
  constructor(type, options) {
    options = options || {};
    this.type = type;
    this.bubbles = options.bubbles !== false;
    this.target = null;
    this.currentTarget = null;
    this.relatedTarget = options.relatedTarget || null;
    this.key = options.key;
    this.repeat = !!options.repeat;
    this.detail = options.detail || 0;
    this.pointerType = options.pointerType || '';
    this.ctrlKey = !!options.ctrlKey;
    this.metaKey = !!options.metaKey;
    this.altKey = !!options.altKey;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this._text = '';
    this._attributes = Object.create(null);
    this._listeners = Object.create(null);
    this._className = '';
    this._dataset = new Proxy({}, {
      get: (target, key) => {
        if (typeof key !== 'string') return target[key];
        return this.getAttribute('data-' + kebabCase(key));
      },
      set: (target, key, value) => {
        this.setAttribute('data-' + kebabCase(String(key)), value);
        return true;
      }
    });
    const element = this;
    this.classList = {
      add: function () {
        const names = new Set(element.className.split(/\s+/).filter(Boolean));
        Array.prototype.forEach.call(arguments, function (name) { names.add(name); });
        element.className = Array.from(names).join(' ');
      },
      remove: function () {
        const removed = Array.prototype.slice.call(arguments);
        element.className = element.className.split(/\s+/).filter(function (name) {
          return name && removed.indexOf(name) === -1;
        }).join(' ');
      },
      contains: function (name) { return element.className.split(/\s+/).indexOf(name) !== -1; },
      toggle: function (name, force) {
        const present = element.classList.contains(name);
        const add = force === undefined ? !present : !!force;
        if (add) element.classList.add(name);
        else element.classList.remove(name);
        return add;
      }
    };
  }

  get className() { return this._className; }
  set className(value) {
    this._className = String(value || '');
    this._attributes.class = this._className;
  }

  get dataset() { return this._dataset; }
  get hidden() { return Object.prototype.hasOwnProperty.call(this._attributes, 'hidden'); }
  set hidden(value) {
    if (value) this._attributes.hidden = '';
    else delete this._attributes.hidden;
  }
  get disabled() { return Object.prototype.hasOwnProperty.call(this._attributes, 'disabled'); }
  set disabled(value) {
    if (value) this._attributes.disabled = '';
    else delete this._attributes.disabled;
  }
  get type() { return this.getAttribute('type') || ''; }
  set type(value) { this.setAttribute('type', value); }
  get tabIndex() {
    const value = this.getAttribute('tabindex');
    return value === null ? -1 : Number(value);
  }
  set tabIndex(value) { this.setAttribute('tabindex', String(value)); }
  get value() {
    if (this._value !== undefined) return this._value;
    return this.getAttribute('value') || '';
  }
  set value(value) { this._value = String(value); }
  get childElementCount() { return this.childNodes.length; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get textContent() {
    return this._text + this.childNodes.map(function (child) { return child.textContent; }).join('');
  }
  set textContent(value) {
    this.childNodes.forEach(function (child) { child.parentNode = null; });
    this.childNodes = [];
    this._text = String(value);
  }
  get innerHTML() { return this.textContent; }
  set innerHTML(value) {
    this.childNodes.forEach(function (child) { child.parentNode = null; });
    this.childNodes = [];
    this._text = '';
    parseMarkup(value, this, this.ownerDocument);
  }

  setAttribute(name, value) {
    name = String(name).toLowerCase();
    value = String(value);
    this._attributes[name] = value;
    if (name === 'class') this._className = value;
    if (name === 'id' && this.ownerDocument) this.ownerDocument._ids[value] = this;
    if (name === 'selected' && this.tagName === 'OPTION' && this.parentNode && this.parentNode.tagName === 'SELECT') {
      this.parentNode.value = this.getAttribute('value') || this.textContent;
    }
  }
  getAttribute(name) {
    name = String(name).toLowerCase();
    return Object.prototype.hasOwnProperty.call(this._attributes, name) ? this._attributes[name] : null;
  }
  removeAttribute(name) { delete this._attributes[String(name).toLowerCase()]; }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = before ? this.childNodes.indexOf(before) : -1;
    child.parentNode = this;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index !== -1) {
      this.childNodes.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }
  dispatchEvent(event) {
    if (!(event instanceof FakeEvent)) event = new FakeEvent(event.type, event);
    if (!event.target) event.target = this;
    let current = this;
    while (current) {
      event.currentTarget = current;
      (current._listeners[event.type] || []).slice().forEach(function (listener) {
        listener.call(current, event);
      });
      if (!event.bubbles) break;
      current = current.parentNode;
    }
    return !event.defaultPrevented;
  }

  focus() {
    const previous = this.ownerDocument.activeElement;
    if (previous === this) return;
    this.ownerDocument.activeElement = this;
    if (previous) previous.dispatchEvent(new FakeEvent('focusout', { relatedTarget: this }));
    this.dispatchEvent(new FakeEvent('focusin', { relatedTarget: previous }));
  }

  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  closest(selector) {
    for (let current = this; current; current = current.parentNode) {
      if (matches(current, selector)) return current;
    }
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const results = [];
    function visit(node) {
      node.childNodes.forEach(function (child) {
        if (matches(child, selector)) results.push(child);
        visit(child);
      });
    }
    visit(this);
    return results;
  }
}

function matches(element, selector) {
  return selector.split(',').some(function (part) {
    part = part.trim();
    const classMatch = part.match(/^\.([a-zA-Z0-9_-]+)$/);
    if (classMatch) return element.classList.contains(classMatch[1]);
    const attrMatch = part.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
    if (attrMatch) {
      const value = element.getAttribute(attrMatch[1]);
      return attrMatch[2] === undefined ? value !== null : value === attrMatch[2];
    }
    return false;
  });
}

class FakeDocument {
  constructor() {
    this._ids = Object.create(null);
    this._listeners = Object.create(null);
    this.parentNode = null;
    this.activeElement = null;
    this.documentElement = new FakeElement('html', this);
    this.documentElement.parentNode = this;
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return this._ids[id] || null; }
  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }
  dispatchEvent(event) {
    if (!(event instanceof FakeEvent)) event = new FakeEvent(event.type, event);
    if (!event.target) event.target = this;
    event.currentTarget = this;
    (this._listeners[event.type] || []).slice().forEach(function (listener) {
      listener.call(this, event);
    }, this);
    return !event.defaultPrevented;
  }
}

function createFakeDOM(html) {
  const document = new FakeDocument();
  parseMarkup(html, document.documentElement, document);
  document.body = document.getElementById('body') || document.documentElement.querySelector('body');
  if (!document.body) {
    document.body = document.createElement('body');
    document.documentElement.appendChild(document.body);
  }
  document.activeElement = document.body;
  const ids = document.documentElement.querySelectorAll('[id]');
  ids.forEach(function (element) {
    document._ids[element.getAttribute('id')] = element;
  });
  const difficulty = document.getElementById('difficulty');
  if (difficulty && difficulty.value === '') difficulty.value = 'normal';
  return { document: document, FakeEvent: FakeEvent };
}

module.exports = { createFakeDOM: createFakeDOM, FakeEvent: FakeEvent };
