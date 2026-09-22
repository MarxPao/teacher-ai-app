import { NextRequest, NextResponse } from 'next/server'
import {
  AgentTask,
  TaskPriority,
  TaskStatus,
  extractTaskCommitment
} from '@/lib/taskMemory'

// Cache em memória do servidor para desenvolvimento/SSR e bridge cross-origin
let serverTasksCache: AgentTask[] = []

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const upcoming = searchParams.get('upcoming') === 'true'
    const status = searchParams.get('status')

    let tasks = [...serverTasksCache]

    if (status) {
      tasks = tasks.filter(t => t.status === status)
    }

    if (upcoming) {
      const now = Date.now()
      const maxTime = now + 48 * 3600 * 1000 // Próximas 48h
      tasks = tasks.filter(t => {
        if (t.status === 'concluida' || t.status === 'cancelada') return false
        const due = new Date(t.dueDate).getTime()
        return !isNaN(due) && due <= maxTime
      }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    }

    return NextResponse.json({
      ok: true,
      tasks,
      total: tasks.length
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao listar tarefas' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Caso 1: Texto livre para extração de compromisso
    if (body.text && typeof body.text === 'string') {
      const extracted = extractTaskCommitment(body.text)
      if (!extracted.isTask || !extracted.task) {
        return NextResponse.json({
          ok: false,
          isTask: false,
          message: 'Nenhum compromisso temporal identificado no texto.'
        }, { headers: corsHeaders })
      }

      const now = new Date().toISOString()
      const newTask: AgentTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: extracted.task.title,
        dueDate: extracted.task.dueDate,
        priority: extracted.task.priority || 'media',
        status: 'pendente',
        sourceDialogueSnippet: extracted.task.sourceDialogueSnippet,
        createdAt: now,
        updatedAt: now
      }

      serverTasksCache.unshift(newTask)
      return NextResponse.json({
        ok: true,
        isTask: true,
        task: newTask
      }, { status: 201, headers: corsHeaders })
    }

    // Caso 2: Criação direta estruturada
    if (!body.title) {
      return NextResponse.json(
        { ok: false, error: 'O título da tarefa é obrigatório' },
        { status: 400, headers: corsHeaders }
      )
    }

    const now = new Date().toISOString()
    const newTask: AgentTask = {
      id: body.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(body.title).trim(),
      description: body.description ? String(body.description).trim() : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate).toISOString() : new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      priority: (body.priority as TaskPriority) || 'media',
      status: (body.status as TaskStatus) || 'pendente',
      relatedStudentName: body.relatedStudentName ? String(body.relatedStudentName).trim() : undefined,
      relatedPortal: body.relatedPortal ? String(body.relatedPortal).trim() : undefined,
      sourceDialogueSnippet: body.sourceDialogueSnippet ? String(body.sourceDialogueSnippet).trim() : undefined,
      createdAt: now,
      updatedAt: now
    }

    serverTasksCache.unshift(newTask)

    return NextResponse.json({
      ok: true,
      task: newTask
    }, { status: 201, headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao criar tarefa' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, title, dueDate, priority } = body

    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID da tarefa obrigatório' }, { status: 400, headers: corsHeaders })
    }

    const idx = serverTasksCache.findIndex(t => t.id === id)
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: 'Tarefa não encontrada' }, { status: 404, headers: corsHeaders })
    }

    const now = new Date().toISOString()
    serverTasksCache[idx] = {
      ...serverTasksCache[idx],
      ...(status ? { status, completedAt: status === 'concluida' ? now : undefined } : {}),
      ...(title ? { title: String(title).trim() } : {}),
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
      ...(priority ? { priority } : {}),
      updatedAt: now
    }

    return NextResponse.json({
      ok: true,
      task: serverTasksCache[idx]
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao atualizar tarefa' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let id = searchParams.get('id')

    if (!id) {
      const body = await request.json().catch(() => ({}))
      id = body?.id
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID da tarefa obrigatório' }, { status: 400, headers: corsHeaders })
    }

    const initialLength = serverTasksCache.length
    serverTasksCache = serverTasksCache.filter(t => t.id !== id)

    return NextResponse.json({
      ok: true,
      deleted: serverTasksCache.length < initialLength
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao remover tarefa' },
      { status: 500, headers: corsHeaders }
    )
  }
}
