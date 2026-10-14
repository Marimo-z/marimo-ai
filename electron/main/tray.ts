import { nativeImage, Tray } from 'electron'
import { buildTrayMenu, type MenuActions } from './menus'
import { renderLogoBitmap } from './services/logo-bitmap'
import type { PetWindow } from './windows/pet-window'

const ICON_PIXELS = 32

export function createTray(pet: PetWindow, actions: MenuActions): Tray {
  const icon = nativeImage.createFromBitmap(renderLogoBitmap(ICON_PIXELS), {
    width: ICON_PIXELS,
    height: ICON_PIXELS,
    scaleFactor: 2
  })
  const tray = new Tray(icon)

  const refresh = (): void => {
    tray.setToolTip(pet.settings.clickThrough ? 'Marimo（鼠标穿透中）' : 'Marimo')
    tray.setContextMenu(buildTrayMenu(pet, actions))
  }

  tray.on('click', () => pet.toggle())
  pet.onChange(refresh)
  refresh()
  return tray
}
