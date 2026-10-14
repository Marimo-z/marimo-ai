import type { Component } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { MagicStick, Microphone, Odometer, Setting, Trophy, User } from '@element-plus/icons-vue'
import AISettingsView from '../../views/AISettingsView.vue'
import GameCenterView from '../../views/GameCenterView.vue'
import OverviewView from '../../views/OverviewView.vue'
import PersonaView from '../../views/PersonaView.vue'
import PetSettingsView from '../../views/PetSettingsView.vue'
import VoiceSettingsView from '../../views/VoiceSettingsView.vue'

export interface NavItem {
  path: string
  title: string
  icon: Component
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/overview', title: '总览', icon: Odometer },
  { path: '/ai', title: 'AI 配置', icon: MagicStick },
  { path: '/persona', title: '人设与记忆', icon: User },
  { path: '/voice', title: '语音设置', icon: Microphone },
  { path: '/pet', title: '桌宠设置', icon: Setting },
  { path: '/games', title: '游戏中心', icon: Trophy }
]

const views: Record<string, Component> = {
  '/overview': OverviewView,
  '/ai': AISettingsView,
  '/persona': PersonaView,
  '/voice': VoiceSettingsView,
  '/pet': PetSettingsView,
  '/games': GameCenterView
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    ...NAV_ITEMS.map((item) => ({
      path: item.path,
      component: views[item.path],
      meta: { title: item.title }
    })),
    { path: '/:pathMatch(.*)*', redirect: '/overview' }
  ]
})

export function isNavPath(path: string): boolean {
  return NAV_ITEMS.some((item) => item.path === path)
}
