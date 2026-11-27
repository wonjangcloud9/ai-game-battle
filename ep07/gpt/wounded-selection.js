(() => {
  'use strict';

  class WoundedSelection {
    constructor({getGame, canAct, select, isFighter, notify}) {
      this.getGame = getGame;
      this.canAct = canAct;
      this.select = select;
      this.isFighter = isFighter;
      this.notify = notify;
      this.game = null;
      this.saved = null;
      this.button = document.getElementById('woundedSelection');

      const mark = document.createElement('i');
      mark.setAttribute('aria-hidden', 'true');
      this.label = document.createElement('span');
      const key = document.createElement('kbd');
      key.textContent = 'Z';
      key.setAttribute('aria-hidden', 'true');
      this.button.append(mark, this.label, key);
      this.button.setAttribute('aria-keyshortcuts', 'Z');
      this.button.addEventListener('click', () => this.toggle());
      this.button.addEventListener('keydown', event => {
        if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation();
      });
    }

    status() {
      const game = this.getGame();
      if (this.game !== game) {
        this.game = game;
        this.saved = null;
      }
      if (!game || game.result) return {visible: false};
      const alive = id => game.byId.get(id)?.hp > 0;
      const selected = game.selected.filter(alive);
      if (this.saved) {
        const filtered = this.saved.filtered.filter(alive);
        const original = this.saved.original.filter(alive);
        const same = filtered.length === selected.length && filtered.every(id => selected.includes(id));
        if (same && original.length > filtered.length) {
          return {visible: true, restore: true, ids: original};
        }
        this.saved = null;
      }
      const wounded = selected.filter(id => {
        const unit = game.byId.get(id);
        return this.isFighter(unit) && unit.hp <= unit.maxHp * .6;
      });
      return {visible: wounded.length > 0, ids: wounded, selected,
        whole: wounded.length > 0 && wounded.length === selected.length};
    }

    refresh() {
      const state = this.status();
      this.button.hidden = !state.visible;
      if (!state.visible) return;
      const count = state.ids.length;
      this.label.textContent = (state.restore ? '원래 선택 ' : '부상병 ') + count;
      this.button.disabled = !this.canAct() || Boolean(state.whole);
      this.button.classList.toggle('restoring', Boolean(state.restore));
      const hint = state.restore ? '살아 있는 원래 부대 '+count+'기 다시 선택'
        : state.whole ? '선택한 전투병 '+count+'기 모두 체력 60% 이하'
        : '체력 60% 이하인 아군 전투병 '+count+'기만 선택';
      this.button.title = hint + ' (Z)';
      this.button.setAttribute('aria-label', hint);
    }

    toggle() {
      if (!this.canAct()) return false;
      const state = this.status();
      if (!state.visible || state.whole) {
        this.notify(state.whole ? '선택한 전투병 모두 체력 60% 이하입니다.'
          : '현재 선택에 체력 60% 이하인 아군 전투병이 없습니다.');
        return false;
      }
      this.saved = state.restore ? null : {original: state.selected, filtered: state.ids};
      this.select(state.ids);
      this.refresh();
      return true;
    }
  }

  window.WoundedSelection = WoundedSelection;
})();
