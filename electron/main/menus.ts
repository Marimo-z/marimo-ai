import { Menu, type MenuItemConstructorOptions } from 'electron'
import { PET_EMOTIONS, PET_EMOTION_LABELS } from '../../shared/pet'
import type { PanelRoute } from './windows/settings-window'
import type { PetWindow } from './windows/pet-window'

export interface MenuActions {
  quit(): void
  openPanel(route?: PanelRoute): void
}

function comingSoon(label: string): MenuItemConstructorOptions {
  return { label: `${label}（即将推出）`, enabled: false }
}

function settingToggles(pet: PetWindow): MenuItemConstructorOptions[] {
  const s = pet.settings
  return [
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: s.alwaysOnTop,
      click: () => pet.updateSettings({ alwaysOnTop: !s.alwaysOnTop })
    },
    {
      label: '眼睛跟随鼠标',
      type: 'checkbox',
      checked: s.followCursor,
      click: () => pet.updateSettings({ followCursor: !s.followCursor })
    },
    {
      label: '待机动画',
      type: 'checkbox',
      checked: s.idleAnimation,
      click: () => pet.updateSettings({ idleAnimation: !s.idleAnimation })
    },
    {
      label: '勿扰模式',
      type: 'checkbox',
      checked: s.doNotDisturb,
      click: () => pet.updateSettings({ doNotDisturb: !s.doNotDisturb })
    },
    {
      label: '鼠标穿透（不打扰模式）',
      type: 'checkbox',
      checked: s.clickThrough,
      click: () => pet.updateSettings({ clickThrough: !s.clickThrough })
    }
  ]
}

export function buildTrayMenu(pet: PetWindow, actions: MenuActions): Menu {
  return Menu.buildFromTemplate([
    { label: pet.visible ? '隐藏桌宠' : '显示桌宠', click: () => pet.toggle() },
    { label: '打开控制面板', click: () => actions.openPanel('/overview') },
    { label: '设置', click: () => actions.openPanel('/pet') },
    { type: 'separator' },
    ...settingToggles(pet),
    { type: 'separator' },
    { label: '退出 Marimo', click: () => actions.quit() }
  ])
}

export function buildPetContextMenu(pet: PetWindow, actions: MenuActions): Menu {
  return Menu.buildFromTemplate([
    comingSoon('聊天'),
    { label: '小游戏', click: () => actions.openPanel('/games') },
    { label: '设置', click: () => actions.openPanel('/pet') },
    { type: 'separator' },
    { label: '说句话', click: () => pet.sendCommand({ type: 'say' }) },
    {
      label: '表情演示',
      submenu: PET_EMOTIONS.map((emotion) => ({
        label: PET_EMOTION_LABELS[emotion],
        click: () => pet.sendCommand({ type: 'emotion', emotion })
      }))
    },
    { type: 'separator' },
    ...settingToggles(pet).slice(1),
    { type: 'separator' },
    { label: '隐藏桌宠', click: () => pet.hide() },
    { label: '退出 Marimo', click: () => actions.quit() }
  ])
}
