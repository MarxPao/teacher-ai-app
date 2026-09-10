import { NextRequest, NextResponse } from 'next/server'
import { convertGoogleSheetsUrlToCsvExport, isSupportedDataUrl } from '@/lib/urlDataImporter'

export const PRIVATE_SHEET_GUIDE_MESSAGE = `Essa planilha parece estar privada — só quem tem a conta certa consegue abrir. Pra eu conseguir importar, você precisa deixá-la visível por link (isso não publica ela no Google, nem aparece em busca — só quem tiver o link específico consegue ver):

1. Abra a planilha no Google Sheets
2. Clique em "Compartilhar" (canto superior direito)
3. Em "Acesso geral", troque para "Qualquer pessoa com o link"
4. Deixe a permissão como "Leitor"
5. Me manda o comando de novo que eu importo na hora

Importante: enquanto estiver como 'qualquer pessoa com o link', quem tiver esse endereço específico consegue ver os dados. Recomendo reverter para privado depois de importar, especialmente se a planilha tiver nomes de alunos.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawUrl = body?.url

    if (!rawUrl || typeof rawUrl !== 'string' || !/^https?:\/\//i.test(rawUrl.trim())) {
      return NextResponse.json(
        {
          success: false,
          code: 'invalid_url',
          error: 'URL inválida. Por favor, forneça um link válido iniciado por http:// ou https://'
        },
        { status: 400 }
      )
    }

    const trimmedUrl = rawUrl.trim()

    // Valida se o formato é suportado (Google Sheets ou CSV)
    if (!isSupportedDataUrl(trimmedUrl)) {
      return NextResponse.json(
        {
          success: false,
          code: 'unsupported_url',
          error: 'Formato de URL não suportado. A importação por URL aceita planilhas do Google Sheets (públicas ou com link de visualização) e links diretos de arquivos CSV.'
        },
        { status: 400 }
      )
    }

    // Converte para a URL de exportação CSV se for Google Sheets
    const conversion = convertGoogleSheetsUrlToCsvExport(trimmedUrl)
    const targetFetchUrl = conversion.exportUrl

    // Faz o fetch server-side para evitar restrições de CORS e inspecionar autenticação
    let response: Response
    try {
      response = await fetch(targetFetchUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/csv, text/plain, application/csv, */*'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
      })
    } catch (fetchErr: any) {
      return NextResponse.json(
        {
          success: false,
          code: 'network_error',
          error: `Falha na conexão ao buscar a planilha: ${fetchErr?.message || 'tempo limite esgotado ou endereço inacessível'}.`
        },
        { status: 502 }
      )
    }

    // Se o status for de autenticação requerida (401 ou 403)
    if (response.status === 401 || response.status === 403) {

      return NextResponse.json(
        {
          success: false,
          code: 'private_sheet',
          error: PRIVATE_SHEET_GUIDE_MESSAGE
        },
        { status: 403 }
      )
    }

    // Se o Google redirecionou para tela de login ou a URL final contém accounts.google.com
    const finalUrl = response.url || ''
    if (finalUrl.includes('accounts.google.com') || finalUrl.includes('ServiceLogin')) {
      return NextResponse.json(
        {
          success: false,
          code: 'private_sheet',
          error: PRIVATE_SHEET_GUIDE_MESSAGE
        },
        { status: 403 }
      )
    }

    // Se for Google Sheets e retornar 404, o Google oculta planilhas restritas com 404 para usuários anônimos
    if (conversion.isGoogleSheets && response.status === 404) {
      return NextResponse.json(
        {
          success: false,
          code: 'private_sheet',
          error: PRIVATE_SHEET_GUIDE_MESSAGE
        },
        { status: 403 }
      )
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          code: 'http_error',
          error: `O servidor retornou o erro HTTP ${response.status} (${response.statusText}) ao tentar baixar a planilha.`
        },
        { status: response.status }
      )
    }


    const text = await response.text()

    // Detecta se a resposta é página HTML de login ou erro do Google em vez de CSV
    const trimmedText = text.trim()
    if (
      trimmedText.toLowerCase().startsWith('<!doctype html') ||
      /<html[\s>]/i.test(trimmedText.slice(0, 500)) ||
      trimmedText.includes('accounts.google.com') ||
      trimmedText.includes('Sign in - Google Accounts')
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'private_sheet',
          error: PRIVATE_SHEET_GUIDE_MESSAGE
        },
        { status: 403 }
      )
    }


    if (!trimmedText) {
      return NextResponse.json(
        {
          success: false,
          code: 'empty_content',
          error: 'A planilha retornada está vazia.'
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      csvContent: text,
      isGoogleSheets: conversion.isGoogleSheets,
      sheetId: conversion.sheetId,
      gid: conversion.gid
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        code: 'server_error',
        error: `Erro interno no servidor ao processar a requisição de URL: ${err?.message || 'erro desconhecido'}`
      },
      { status: 500 }
    )
  }
}
