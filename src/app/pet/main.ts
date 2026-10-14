import { createPinia } from 'pinia'
import { createApp } from 'vue'
import '../../styles/base.css'
import PetApp from './PetApp.vue'

createApp(PetApp).use(createPinia()).mount('#app')
