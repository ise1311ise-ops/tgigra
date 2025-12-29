/* Вдрова — Telegram WebApp заказ
 * Отправка заказа: Telegram.WebApp.sendData(JSON.stringify(payload))
 */

const tg = window.Telegram?.WebApp;

const PRODUCTS = [
  // BEER
  { id: "beer_ipa_05", tab: "beer", name: "IPA", meta: "0.5 л • 6.2%", price: 190 },
  { id: "beer_lager_05", tab: "beer", name: "Лагер", meta: "0.5 л • 4.7%", price: 150 },
  { id: "beer_stout_05", tab: "beer", name: "Стаут", meta: "0.5 л • 7.0%", price: 210 },
  { id: "beer_wheat_05", tab: "beer", name: "Пшеничное", meta: "0.5 л • 5.2%", price: 170 },
  { id: "beer_apa_05", tab: "beer", name: "APA", meta: "0.5 л • 5.8%", price: 185 },
  { id: "beer_cider_05", tab: "beer", name: "Сидр", meta: "0.5 л • 4.5%", price: 160 },

  // FISH
  { id: "fish_vobla", tab: "fish", name: "Вобла", meta: "100 г", price: 130 },
  { id: "fish_sudak", tab: "fish", name: "Судак сушёный", meta: "100 г", price: 190 },
  { id: "fish_kalmar", tab: "fish", name: "Кальмар", meta: "100 г", price: 160 },
  { id: "fish_anchous", tab: "fish", name: "Анчоус", meta: "100 г", price: 140 },
  { id: "fish_som", tab: "fish", name: "Сом", meta: "100 г", price: 200 },

  // SNACK
  { id: "snack_suhariki", tab: "snack", name: "Сухарики", meta: "1 пачка", price: 75 },
  { id: "snack_chips", tab: "snack", name: "Чипсы", meta: "1 пачка", price: 120 },
  { id: "snack_peanuts", tab: "snack", name: "Арахис", meta: "100 г", price: 90 },
  { id: "snack_cheese", tab: "snack", name: "Сырные шарики", meta: "1 пачка", price: 110 },
];

const $ = (id) => document.getElementById(id);

const state = {
  tab: "beer",
  search: "",
  mode: "delivery", // delivery | pickup
  cart: loadCart(),
};

function loadCart() {
  try {
    const raw = localStorage.getItem("vdrova_cart");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveCart() {
  localStorage.setItem("vdrova_cart", JSON.stringify(state.cart));
}

function money(n) {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

function toast(msg, kind = "info") {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  t.style.borderColor =
    kind === "bad" ? "rgba(255,95,122,.35)"
    : kind === "good" ? "rgba(82,255,154,.30)"
    : "rgba(105,243,255,.18)";
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.add("hidden"), 2400);
}

function getCartCount() {
  return Object.values(state.cart).reduce((a, v) => a + v, 0);
}
function getCartTotal() {
  let sum = 0;
  for (const [id, qty] of Object.entries(state.cart)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (p) sum += p.price * qty;
  }
  return sum;
}

function setMode(mode) {
  state.mode = mode;
  $("modeDelivery").classList.toggle("active", mode === "delivery");
  $("modePickup").classList.toggle("active", mode === "pickup");

  $("deliveryBlock").classList.toggle("hidden", mode !== "delivery");
  $("pickupBlock").classList.toggle("hidden", mode !== "pickup");

  $("deliveryPill").textContent = mode === "delivery" ? "Доставка" : "Самовывоз";
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  renderProducts();
}

function renderProducts() {
  const grid = $("productGrid");
  grid.innerHTML = "";

  const q = state.search.trim().toLowerCase();
  const list = PRODUCTS.filter(p => p.tab === state.tab)
    .filter(p => {
      if (!q) return true;
      return (p.name + " " + p.meta).toLowerCase().includes(q);
    });

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Ничего не найдено. Попробуй другой запрос.";
    grid.appendChild(empty);
    return;
  }

  for (const p of list) {
    const qty = state.cart[p.id] || 0;

    const card = document.createElement("div");
    card.className = "item";

    card.innerHTML = `
      <div class="itemTop">
        <div>
          <div class="itemName">${escapeHtml(p.name)}</div>
          <div class="itemMeta">${escapeHtml(p.meta)}</div>
        </div>
        <div class="price">${money(p.price)}</div>
      </div>

      <div class="itemActions">
        <div class="qtyWrap">
          <button class="qtyBtn" data-act="dec" data-id="${p.id}" type="button">−</button>
          <div class="qty" id="qty_${p.id}">${qty}</div>
          <button class="qtyBtn" data-act="inc" data-id="${p.id}" type="button">+</button>
        </div>

        <button class="addBtn" data-act="add" data-id="${p.id}" type="button">
          Добавить
        </button>
      </div>
    `;

    grid.appendChild(card);
  }

  grid.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "inc") changeQty(id, +1);
      if (act === "dec") changeQty(id, -1);
      if (act === "add") changeQty(id, +1);
    });
  });
}

function renderCart() {
  const list = $("cartList");
  list.innerHTML = "";

  const entries = Object.entries(state.cart)
    .map(([id, qty]) => ({ p: PRODUCTS.find(x => x.id === id), qty }))
    .filter(x => x.p && x.qty > 0);

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Корзина пустая. Добавь что-нибудь вкусное 🙂";
    list.appendChild(empty);
  } else {
    for (const { p, qty } of entries) {
      const item = document.createElement("div");
      item.className = "cartItem";
      item.innerHTML = `
        <div class="cartRow">
          <div>
            <div class="cartName">${escapeHtml(p.name)}</div>
            <div class="cartMeta">${escapeHtml(p.meta)} • ${money(p.price)} / шт</div>
          </div>
          <div class="price">${money(p.price * qty)}</div>
        </div>
        <div class="cartActions">
          <button class="qtyBtn" data-act="dec" data-id="${p.id}" type="button">−</button>
          <div class="qty">${qty}</div>
          <button class="qtyBtn" data-act="inc" data-id="${p.id}" type="button">+</button>
          <button class="rmBtn" data-act="rm" data-id="${p.id}" type="button">Удалить</button>
        </div>
      `;
      list.appendChild(item);
    }

    list.querySelectorAll("button[data-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === "inc") changeQty(id, +1);
        if (act === "dec") changeQty(id, -1);
        if (act === "rm") removeItem(id);
      });
    });
  }

  $("cartTotal").textContent = money(getCartTotal());
}

function updateBadges() {
  const c = getCartCount();
  $("cartBadge").textContent = String(c);
  $("cartBadge").style.display = c > 0 ? "inline-block" : "none";

  // Telegram MainButton (если доступен)
  if (tg && tg.MainButton) {
    if (c > 0) {
      tg.MainButton.setText(`Отправить заказ • ${money(getCartTotal())}`);
      tg.MainButton.show();
      tg.MainButton.enable();
    } else {
      tg.MainButton.hide();
    }
  }
}

function changeQty(id, delta) {
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) delete state.cart[id];
  else state.cart[id] = next;

  saveCart();

  // обновить qty в каталоге
  const el = document.getElementById(`qty_${id}`);
  if (el) el.textContent = String(state.cart[id] || 0);

  renderCart();
  updateBadges();
}

function removeItem(id) {
  delete state.cart[id];
  saveCart();
  const el = document.getElementById(`qty_${id}`);
  if (el) el.textContent = "0";
  renderCart();
  updateBadges();
}

function clearCart() {
  state.cart = {};
  saveCart();
  renderProducts();
  renderCart();
  updateBadges();
}

function openCart() {
  $("cartDrawer").classList.remove("hidden");
  renderCart();
}
function closeCart() {
  $("cartDrawer").classList.add("hidden");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildOrderPayload() {
  const items = Object.entries(state.cart)
    .map(([id, qty]) => {
      const p = PRODUCTS.find(x => x.id === id);
      return p ? { id: p.id, name: p.name, meta: p.meta, price: p.price, qty, sum: p.price * qty } : null;
    })
    .filter(Boolean);

  const total = items.reduce((a, it) => a + it.sum, 0);

  const payload = {
    shop: "Вдрова",
    createdAt: new Date().toISOString(),
    mode: state.mode,
    delivery: state.mode === "delivery"
      ? {
          address: $("addressInput").value.trim(),
          area: $("areaSelect").value,
        }
      : null,
    pickup: state.mode === "pickup"
      ? { point: $("pickupSelect").value }
      : null,
    payment: $("paySelect").value,
    comment: $("commentInput").value.trim(),
    items,
    total,
    user: tg?.initDataUnsafe?.user
      ? {
          id: tg.initDataUnsafe.user.id,
          username: tg.initDataUnsafe.user.username || null,
          first_name: tg.initDataUnsafe.user.first_name || null,
          last_name: tg.initDataUnsafe.user.last_name || null,
          language_code: tg.initDataUnsafe.user.language_code || null,
        }
      : null,
  };

  return payload;
}

function validateBeforeSend() {
  if (!($("ageCheck").checked)) {
    toast("Нужно подтвердить, что тебе есть 18 лет.", "bad");
    return false;
  }
  const count = getCartCount();
  if (count <= 0) {
    toast("Корзина пустая — добавь товары.", "bad");
    return false;
  }
  if (state.mode === "delivery") {
    const addr = $("addressInput").value.trim();
    if (addr.length < 6) {
      toast("Укажи адрес доставки (улица/дом и т.д.).", "bad");
      return false;
    }
  }
  return true;
}

function sendOrder() {
  if (!validateBeforeSend()) return;

  const payload = buildOrderPayload();
  const data = JSON.stringify(payload);

  if (!tg) {
    // Для теста в браузере
    console.log("ORDER_DATA:", data);
    toast("Тест: заказ выведен в консоль (не в Telegram).", "good");
    return;
  }

  try {
    tg.sendData(data);
    toast("Заказ отправлен ✅", "good");
    // Можно закрыть мини-апп:
    // tg.close();
  } catch (e) {
    console.error(e);
    toast("Не удалось отправить заказ. Попробуй ещё раз.", "bad");
  }
}

function initTelegramUi() {
  if (!tg) return;

  tg.ready();

  // Цвета под тему Telegram (не обязательно, но приятно)
  try {
    tg.expand();
  } catch {}

  // Приветствие
  const u = tg.initDataUnsafe?.user;
  if (u?.first_name) {
    $("helloLine").textContent = `Привет, ${u.first_name}! Собери заказ и отправь в чат.`;
  }

  // MainButton
  if (tg.MainButton) {
    tg.MainButton.hide();
    tg.MainButton.onClick(sendOrder);
  }

  // BackButton (закрывает корзину)
  if (tg.BackButton) {
    tg.BackButton.hide();
    tg.BackButton.onClick(() => {
      if (!$("cartDrawer").classList.contains("hidden")) closeCart();
      else tg.close();
    });
  }
}

function hookEvents() {
  // mode
  $("modeDelivery").addEventListener("click", () => setMode("delivery"));
  $("modePickup").addEventListener("click", () => setMode("pickup"));

  // tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  // search
  $("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderProducts();
  });

  // cart drawer
  $("btnOpenCart").addEventListener("click", () => {
    openCart();
    if (tg?.BackButton) tg.BackButton.show();
  });
  $("btnCloseCart").addEventListener("click", () => {
    closeCart();
    if (tg?.BackButton) tg.BackButton.hide();
  });
  $("drawerOverlay").addEventListener("click", () => {
    closeCart();
    if (tg?.BackButton) tg.BackButton.hide();
  });

  // clear/send
  $("btnClear").addEventListener("click", () => {
    clearCart();
    toast("Корзина очищена.", "good");
  });
  $("btnSend").addEventListener("click", sendOrder);
  $("btnSend2").addEventListener("click", sendOrder);

  // persist inputs lightly
  const persistIds = ["addressInput", "commentInput", "paySelect", "areaSelect", "pickupSelect", "ageCheck"];
  persistIds.forEach(id => {
    const el = $(id);
    const key = `vdrova_${id}`;
    // restore
    try {
      const v = localStorage.getItem(key);
      if (v !== null) {
        if (el.type === "checkbox") el.checked = v === "1";
        else el.value = v;
      }
    } catch {}
    // save
    el.addEventListener("change", () => {
      try {
        if (el.type === "checkbox") localStorage.setItem(key, el.checked ? "1" : "0");
        else localStorage.setItem(key, el.value);
      } catch {}
    });
  });
}

function start() {
  initTelegramUi();
  hookEvents();
  setMode(state.mode);
  renderProducts();
  renderCart();
  updateBadges();

  // если корзина открыта — показать BackButton
  if (tg?.BackButton) tg.BackButton.hide();
}

start();
