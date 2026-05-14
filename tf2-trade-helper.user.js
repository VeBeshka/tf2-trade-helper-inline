// ==UserScript==
// @name         TF2 Trade Helper INLINE
// @namespace    https://github.com/VeBeshka/tf2-trade-helper-inline
// @version      1.0
// @author       VeBeshka
// @description  TF2 trade helper for Backpack.tf and Steam trade offers
// @icon         https://raw.githubusercontent.com/VeBeshka/tf2-trade-helper-inline/main/icon.png

// @match        https://steamcommunity.com/tradeoffer/*
// @match        https://backpack.tf/classifieds*
// @match        https://backpack.tf/stats/*

// @downloadURL  https://raw.githubusercontent.com/VeBeshka/tf2-trade-helper-inline/main/tf2-trade-helper.user.js
// @updateURL    https://raw.githubusercontent.com/VeBeshka/tf2-trade-helper-inline/main/tf2-trade-helper.user.js

// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'vebeshka-tf2-helper-inline';
    const KEY_PRICE = 54.49;

    if (location.hostname.includes('backpack.tf')) {
        runBackpackTfLinkEnhancer();
        return;
    }

    let SETTINGS_OPEN = localStorage.getItem('vth_settings_open') === '1';
    let FULL_INFO = localStorage.getItem('vth_full_info') !== '0';
    let THEME = localStorage.getItem('vth_theme') || 'purple';

    const THEMES = {
        purple: { bg: '#171020', input: '#0f0a17', border: '#9b4dff', accent: '#c77dff', btn: '#7d3dcc', text: '#fff', muted: '#aaa' },
        blue: { bg: '#111820', input: '#0e1117', border: '#66c0f4', accent: '#66c0f4', btn: '#2678b9', text: '#fff', muted: '#9aa' },
        green: { bg: '#101d16', input: '#0b140f', border: '#4dff91', accent: '#4dff91', btn: '#237a47', text: '#fff', muted: '#9ab' },
        black: { bg: '#070707', input: '#000', border: '#777', accent: '#ccc', btn: '#333', text: '#fff', muted: '#999' }
    };

    const th = () => THEMES[THEME] || THEMES.purple;

    function fmt(n) {
        return Number(n).toFixed(2);
    }

    function parseBackpackPrice(priceText) {
        const text = String(priceText || '')
            .toLowerCase()
            .replace(/,/g, '.')
            .replace(/\s+/g, ' ')
            .trim();

        if (!text) return null;

        const keyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:keys|key)/);
        const refMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:ref|metal)/);

        if (keyMatch) {
            const priceKeys = Number(keyMatch[1]);
            if (!Number.isFinite(priceKeys)) return null;

            const keys = Math.floor(priceKeys);
            const metal = (priceKeys - keys) * KEY_PRICE;

            return {
                price: priceKeys.toFixed(2),
                keys: String(keys),
                metal: fmt(metal)
            };
        }

        if (refMatch) {
            const metal = Number(refMatch[1]);
            if (!Number.isFinite(metal)) return null;

            return {
                price: '',
                keys: '0',
                metal: fmt(metal)
            };
        }

        return null;
    }

    function runBackpackTfLinkEnhancer() {
        function enhance() {
            document.querySelectorAll('.listing').forEach(listing => {
                const item = listing.querySelector('.item');
                const buttons = listing.querySelector('.listing-buttons');

                if (!item || !buttons) return;

                const tradeButton = buttons.lastElementChild;

                if (!tradeButton || !tradeButton.href) return;

                const price =
                    item.dataset.listing_price ||
                    item.dataset.p_bptf ||
                    item.getAttribute('title') ||
                    '';

                const parsed = parseBackpackPrice(price);

                if (parsed === null) return;

                const url = new URL(tradeButton.href, location.href);

                if (parsed.price) {
                    url.searchParams.set('vth_price', parsed.price);
                }

                url.searchParams.set('vth_keys', parsed.keys);
                url.searchParams.set('vth_metal', parsed.metal);

                tradeButton.href = url.toString();
            });
        }

        enhance();

        new MutationObserver(enhance).observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function wait() {
        if (!document.querySelector('.trade_left') || !window.UserYou || !window.UserThem || !window.g_rgCurrentTradeStatus) {
            setTimeout(wait, 500);
            return;
        }

        init();
    }

    function invMap(user) {
        try {
            return user?.rgContexts?.[440]?.[2]?.inventory?.rgInventory || {};
        } catch {
            return {};
        }
    }

    function invItems(user) {
        return Object.values(invMap(user));
    }

    function offerItems(selector, user) {
        const map = invMap(user);
        const out = [];

        document.querySelectorAll(`${selector} .item[id^="item440_2_"]`).forEach(el => {
            const id = el.id.replace('item440_2_', '');

            if (map[id]) out.push(map[id]);
        });

        return out;
    }

    function count(items) {
        const c = { key: 0, ref: 0, rec: 0, scrap: 0, total: items.length };

        for (const item of items) {
            const name = item.market_hash_name || '';
            const amount = Number(item.amount || 1);

            if (name === 'Mann Co. Supply Crate Key') c.key += amount;
            if (name === 'Refined Metal') c.ref += amount;
            if (name === 'Reclaimed Metal') c.rec += amount;
            if (name === 'Scrap Metal') c.scrap += amount;
        }

        return c;
    }

    function value(c) {
        return c.key * KEY_PRICE + c.ref + c.rec / 3 + c.scrap / 9;
    }

    function parseKeys(v) {
        const n = Number(String(v || '').replace(',', '.').trim());

        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    }

    function parseMetal(v) {
        const raw = String(v || '').replace(',', '.').trim();

        if (!raw) return 0;
        if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;

        return Math.round(Number(raw) * 9);
    }

    function priceToParts(price) {
        const n = Number(String(price || '').replace(',', '.').trim());

        if (!Number.isFinite(n) || n < 0) return null;

        const keys = Math.floor(n);
        const metal = (n - keys) * KEY_PRICE;

        return { keys, metal: fmt(metal) };
    }

    function offeredIds(selector) {
        const ids = new Set();

        document.querySelectorAll(`${selector} .item[id^="item440_2_"]`).forEach(el => {
            ids.add(el.id.replace('item440_2_', ''));
        });

        return ids;
    }

    function available(user, selector, filter) {
        const used = offeredIds(selector);

        return invItems(user).filter(item =>
            item &&
            item.tradable === 1 &&
            item.id &&
            !used.has(item.id) &&
            filter(item)
        );
    }

    function pickKeys(user, selector, amount) {
        const items = available(user, selector, item =>
            item.market_hash_name === 'Mann Co. Supply Crate Key'
        );

        return items.length >= amount ? items.slice(0, amount) : null;
    }

    function pickMetal(user, selector, scrapAmount) {
        const all = available(user, selector, item =>
            item.market_hash_name === 'Refined Metal' ||
            item.market_hash_name === 'Reclaimed Metal' ||
            item.market_hash_name === 'Scrap Metal'
        );

        const ref = all.filter(i => i.market_hash_name === 'Refined Metal');
        const rec = all.filter(i => i.market_hash_name === 'Reclaimed Metal');
        const scrap = all.filter(i => i.market_hash_name === 'Scrap Metal');

        const selected = [];
        let remain = scrapAmount;

        while (remain >= 9 && ref.length) {
            selected.push(ref.shift());
            remain -= 9;
        }

        while (remain >= 3 && rec.length) {
            selected.push(rec.shift());
            remain -= 3;
        }

        while (remain >= 1 && scrap.length) {
            selected.push(scrap.shift());
            remain -= 1;
        }

        while (remain >= 9 && rec.length >= 3) {
            selected.push(rec.shift(), rec.shift(), rec.shift());
            remain -= 9;
        }

        while (remain >= 9 && scrap.length >= 9) {
            for (let i = 0; i < 9; i++) selected.push(scrap.shift());

            remain -= 9;
        }

        while (remain >= 3 && scrap.length >= 3) {
            selected.push(scrap.shift(), scrap.shift(), scrap.shift());
            remain -= 3;
        }

        return remain === 0 ? selected : null;
    }

    function fastAdd(items, isThem) {
        if (!items || !items.length) return;

        const statusObj = window.g_rgCurrentTradeStatus;
        const side = isThem ? statusObj.them : statusObj.me;

        if (!side.assets) side.assets = [];

        const existing = new Set(
            side.assets.map(slot =>
                `${slot.appid}_${slot.contextid}_${slot.assetid || slot.id}`
            )
        );

        for (const item of items) {
            const key = `${item.appid}_${item.contextid}_${item.id}`;

            if (existing.has(key)) continue;

            side.assets.push({
                appid: item.appid,
                contextid: item.contextid,
                assetid: item.id,
                amount: 1
            });

            existing.add(key);
        }

        window.g_rgCurrentTradeStatus.version++;
        window.RefreshTradeStatus(window.g_rgCurrentTradeStatus);
    }

    function addKeys(user, selector, inputId, isThem) {
        const amount = parseKeys(document.getElementById(inputId)?.value);

        if (amount === null) return status('Invalid keys', true);
        if (amount === 0) return;

        const items = pickKeys(user, selector, amount);

        if (!items) return status('Not enough keys', true);

        fastAdd(items, isThem);
        status('Done', false, true);
        render(true);
    }

    function addMetal(user, selector, inputId, isThem) {
        const scrap = parseMetal(document.getElementById(inputId)?.value);

        if (scrap === null) return status('Invalid metal', true);
        if (scrap === 0) return;

        const items = pickMetal(user, selector, scrap);

        if (!items) return status('Not enough metal', true);

        fastAdd(items, isThem);
        status('Done', false, true);
        render(true);
    }

    function clearSide(selector) {
        const els = [...document.querySelectorAll(`${selector} .item[id^="item440_2_"]`)];

        if (!els.length) return;

        if (window.GTradeStateManager?.RemoveItemsFromTrade) {
            window.GTradeStateManager.RemoveItemsFromTrade(els.reverse());
        } else {
            for (const el of els) window.MoveItemToInventory(el);
        }

        status('Cleared', false, true);
        setTimeout(() => render(true), 150);
    }

    function status(text, error = false, success = false) {
        const el = document.getElementById('vth-status');

        if (!el) return;

        el.textContent = text;
        el.style.color = error ? '#ff5555' : success ? '#00e676' : th().muted;
    }

    function createPanel() {
        let panel = document.getElementById(PANEL_ID);

        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            (document.querySelector('.trade_left') || document.body).appendChild(panel);
        }

        const t = th();

        panel.style.marginTop = '12px';
        panel.style.padding = '8px';
        panel.style.background = t.bg;
        panel.style.border = `1px solid ${t.border}`;
        panel.style.borderRadius = '4px';
        panel.style.color = t.text;
        panel.style.font = '12px Arial, sans-serif';
        panel.style.boxSizing = 'border-box';
        panel.style.maxWidth = '100%';

        return panel;
    }

    function input(id, ph) {
        return `
            <input id="${id}" type="text" placeholder="${ph}" style="
                width:100%;
                background:${th().input};
                color:${th().text};
                border:1px solid ${th().border};
                padding:3px;
                font-size:11px;
                box-sizing:border-box;
            ">
        `;
    }

    function btn(id, text, red = false) {
        return `
            <button id="${id}" style="
                background:${red ? '#8b2323' : th().btn};
                color:#fff;
                border:none;
                padding:4px 7px;
                cursor:pointer;
                font-weight:bold;
                font-size:11px;
            ">${text}</button>
        `;
    }

    function stats(title, c) {
        return `
            <div style="margin-top:4px;">
                <b style="color:${th().accent};">${title}</b>
                <div style="display:flex;justify-content:space-between;white-space:nowrap;">
                    <span>K:${c.key}</span>
                    <span>Ref:${c.ref}</span>
                    <span>Rec:${c.rec}</span>
                    <span>Scr:${c.scrap}</span>
                </div>
            </div>
        `;
    }

    function settings() {
        return `
            <div style="margin-top:7px;">
                <button id="vth-settings" style="
                    width:100%;
                    background:${th().input};
                    color:${th().text};
                    border:1px solid ${th().border};
                    padding:3px 6px;
                    cursor:pointer;
                    text-align:left;
                    font-size:11px;
                ">⚙ Settings ${SETTINGS_OPEN ? '▲' : '▼'}</button>

                ${SETTINGS_OPEN ? `
                    <div style="margin-top:5px;padding:6px;border:1px solid ${th().border};background:${th().input};">
                        <label><input id="vth-full" type="checkbox" ${FULL_INFO ? 'checked' : ''}> Full info</label><br>

                        <div style="margin-top:5px;">Theme</div>
                        <select id="vth-theme" style="width:100%;">
                            <option value="purple" ${THEME === 'purple' ? 'selected' : ''}>Purple</option>
                            <option value="blue" ${THEME === 'blue' ? 'selected' : ''}>Blue</option>
                            <option value="green" ${THEME === 'green' ? 'selected' : ''}>Green</option>
                            <option value="black" ${THEME === 'black' ? 'selected' : ''}>Black</option>
                        </select>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function render(force = false) {
        const active = document.activeElement;

        if (!force && active?.closest?.(`#${PANEL_ID}`)) return;

        const old = {
            price: document.getElementById('vth-price')?.value ?? '',
            keys: document.getElementById('vth-keys')?.value ?? '',
            metal: document.getElementById('vth-metal')?.value ?? ''
        };

        const panel = createPanel();

        const inv = count(invItems(window.UserYou));
        const your = count(offerItems('#your_slots', window.UserYou));
        const their = count(offerItems('#their_slots', window.UserThem));

        const give = value(your);
        const receive = value(their);
        const profit = receive - give;

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;">
                <b style="color:${th().accent};font-size:13px;">TF2 Helper v2.7</b>
                <span style="color:${th().muted};font-size:11px;">by. VeBeshka</span>
            </div>

            <div style="margin-top:4px;">
                <b>Profit:</b>
                <span style="color:${profit >= 0 ? '#00e676' : '#ff5252'};">
                    ${profit >= 0 ? '+' : ''}${fmt(profit)} ref
                </span>
            </div>

            ${FULL_INFO ? `
                ${stats('Inventory', inv)}
                ${stats('Your offer', your)}
                ${stats('Their offer', their)}
                <div style="margin-top:4px;">
                    Give: <b>${fmt(give)} ref</b> |
                    Receive: <b>${fmt(receive)} ref</b>
                </div>
            ` : ''}

            <div style="display:grid;grid-template-columns:45px 1fr auto;gap:4px;align-items:center;margin-top:7px;">
                <span>Price</span>
                ${input('vth-price', '13.78')}
                ${btn('vth-fill', 'Fill')}

                <span>Keys</span>
                ${input('vth-keys', '13')}
                <div style="display:flex;gap:4px;">${btn('vth-add-keys', 'Add')}${btn('vth-req-keys', 'Req')}</div>

                <span>Metal</span>
                ${input('vth-metal', '42.55')}
                <div style="display:flex;gap:4px;">${btn('vth-add-metal', 'Add')}${btn('vth-req-metal', 'Req')}</div>
            </div>

            <div style="display:flex;gap:5px;margin-top:7px;">
                ${btn('vth-clear-my', 'Clear mine')}
                ${btn('vth-clear-their', 'Clear theirs')}
            </div>

            <div id="vth-status" style="min-height:14px;margin-top:4px;color:${th().muted};font-size:11px;"></div>

            ${settings()}
        `;

        document.getElementById('vth-price').value = old.price;
        document.getElementById('vth-keys').value = old.keys;
        document.getElementById('vth-metal').value = old.metal;

        bind();
    }

    function bind() {
        document.getElementById('vth-fill').onclick = () => {
            const p = priceToParts(document.getElementById('vth-price').value);

            if (!p) return status('Invalid price', true);

            document.getElementById('vth-keys').value = String(p.keys);
            document.getElementById('vth-metal').value = p.metal;

            status(`${p.keys} keys + ${p.metal} ref`);
        };

        document.getElementById('vth-add-keys').onclick = () =>
            addKeys(window.UserYou, '#your_slots', 'vth-keys', false);

        document.getElementById('vth-req-keys').onclick = () =>
            addKeys(window.UserThem, '#their_slots', 'vth-keys', true);

        document.getElementById('vth-add-metal').onclick = () =>
            addMetal(window.UserYou, '#your_slots', 'vth-metal', false);

        document.getElementById('vth-req-metal').onclick = () =>
            addMetal(window.UserThem, '#their_slots', 'vth-metal', true);

        document.getElementById('vth-clear-my').onclick = () => clearSide('#your_slots');
        document.getElementById('vth-clear-their').onclick = () => clearSide('#their_slots');

        document.getElementById('vth-settings').onclick = () => {
            SETTINGS_OPEN = !SETTINGS_OPEN;
            localStorage.setItem('vth_settings_open', SETTINGS_OPEN ? '1' : '0');
            render(true);
        };

        const full = document.getElementById('vth-full');

        if (full) {
            full.onchange = function () {
                FULL_INFO = this.checked;
                localStorage.setItem('vth_full_info', FULL_INFO ? '1' : '0');
                render(true);
            };
        }

        const themeSelect = document.getElementById('vth-theme');

        if (themeSelect) {
            themeSelect.onchange = function () {
                THEME = this.value;
                localStorage.setItem('vth_theme', THEME);
                render(true);
            };
        }

        ['vth-price', 'vth-keys', 'vth-metal'].forEach(id => {
            document.getElementById(id).onkeydown = e => {
                if (e.key !== 'Enter') return;

                e.preventDefault();

                if (id === 'vth-price') document.getElementById('vth-fill').click();
                if (id === 'vth-keys') document.getElementById('vth-add-keys').click();
                if (id === 'vth-metal') document.getElementById('vth-add-metal').click();
            };
        });
    }

    function getAllUrlParams() {
        const text = `${location.search}&${location.hash.replace(/^#/, '')}`;
        return new URLSearchParams(text);
    }

    function readListingParams() {
        const p = getAllUrlParams();

        const directPrice = p.get('vth_price');
        const directKeys = p.get('vth_keys');
        const directMetal = p.get('vth_metal');

        if (directKeys !== null || directMetal !== null) {
            const priceInput = document.getElementById('vth-price');
            const keysInput = document.getElementById('vth-keys');
            const metalInput = document.getElementById('vth-metal');

            if (priceInput) priceInput.value = directPrice || '';
            if (keysInput) keysInput.value = directKeys || '0';
            if (metalInput) metalInput.value = directMetal || '0';

            status(`Loaded: ${directKeys || 0} keys + ${directMetal || 0} ref`);
            return;
        }

        const keys = p.get('listing_currencies_keys');
        const metal = p.get('listing_currencies_metal');

        if (keys !== null || metal !== null) {
            const k = document.getElementById('vth-keys');
            const m = document.getElementById('vth-metal');
            const priceInput = document.getElementById('vth-price');

            if (k) k.value = keys || '0';
            if (m) m.value = metal || '0';

            const price = Number(keys || 0) + Number(metal || 0) / KEY_PRICE;

            if (priceInput) {
                priceInput.value = price.toFixed(2);
            }

            status(`Loaded listing: ${keys || 0} keys + ${metal || 0} ref`);
        }
    }

    function forcePartnerInventoryLoad() {
        try {
            const statusObj = window.g_rgCurrentTradeStatus;

            if (!statusObj.them.assets) statusObj.them.assets = [];

            statusObj.them.assets.push({
                appid: 440,
                contextid: '2',
                assetid: '0',
                amount: 1
            });

            window.RefreshTradeStatus(statusObj, true);

            statusObj.them.assets = statusObj.them.assets.filter(x => x.assetid !== '0');

            window.RefreshTradeStatus(statusObj, true);
        } catch (e) {
            console.warn('[TF2 Helper] force inventory load failed', e);
        }
    }

    async function waitForPartnerItem(assetid, tries = 20) {
        for (let i = 0; i < tries; i++) {
            const them = invMap(window.UserThem);

            if (them[assetid]) {
                return them[assetid];
            }

            forcePartnerInventoryLoad();

            await new Promise(r => setTimeout(r, 500));
        }

        return null;
    }

    async function autoAddForItem() {
        const params = getAllUrlParams();

        const raw =
            params.get('for_item') ||
            params.get('item') ||
            params.get('assetid') ||
            params.get('select');

        if (!raw) return;

        const assetid = String(raw)
            .split(',')[0]
            .replace(/^440_2_/, '')
            .replace(/[^\d]/g, '');

        if (!assetid) return;

        const key = `vth_for_item_${assetid}`;

        if (sessionStorage.getItem(key) === '1') return;

        status('Searching URL item...');

        const item = await waitForPartnerItem(assetid);

        if (!item) {
            status('URL item not found in partner inventory', true);
            return;
        }

        fastAdd([item], true);

        sessionStorage.setItem(key, '1');
        status('URL item added', false, true);

        setTimeout(() => render(true), 300);
    }

    function init() {
        render(true);
        readListingParams();
        autoAddForItem();

        const observer = new MutationObserver(() => {
            clearTimeout(window.__vth);
            window.__vth = setTimeout(() => render(false), 250);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
    }

    wait();
})();