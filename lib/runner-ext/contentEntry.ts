// lib/runner-ext/contentEntry.ts
// Ponto de entrada do Content Script da extensão para o SkillGraph v2

import { initContentAdapter } from './contentAdapter'

// Inicializa o adaptador RPC para o DomDriver no contexto do frame
initContentAdapter()
