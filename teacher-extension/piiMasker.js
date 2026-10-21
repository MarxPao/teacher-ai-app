/**
 * piiMasker.js — Zero-PII Gateway & Sanitizador Estrutural LGPD
 * UMD (Universal Module Definition) para compatibilidade nativa:
 * - Chrome Extension Side Panel (via <script src>)
 * - Chrome Extension Service Worker (via importScripts)
 * - Next.js App / Node.js (via require / import)
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    module.exports.default = module.exports;
  } else {
    var exp = factory();
    root.maskPii = exp.maskPii;
    root.unmaskPii = exp.unmaskPii;
    root.maskChatHistory = exp.maskChatHistory;
    root.unmaskToolUse = exp.unmaskToolUse;
    root.structurallySanitizeElements = exp.structurallySanitizeElements;
    root.guardEgress = exp.guardEgress;
    root.EgressSecurityError = exp.EgressSecurityError;
    root.UnresolvedTokenError = exp.UnresolvedTokenError;
    root.TeacherPiiMasker = exp;
  }
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // Padrões de dados sensíveis (PII)
  // CPF: com pontuação, sem pontuação (11 dígitos consecutivos), ou barra
  var CPF_REGEX = /\b(?:\d{3}\.?\d{3}\.?\d{3}[-/]?\d{2}|\d{11})\b/g;

  // Telefone: (XX) 9XXXX-XXXX, XX9XXXXXXXX, +55 XX XXXXX-XXXX, fixos 4 dígitos
  // O lookbehind impede casar o final de IDs numéricos longos (ex.: cls_1785639505494)
  var PHONE_REGEX = /(?<![\d_])(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})\b/g;

  // E-mail
  var EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

  // Stopwords e termos pedagógicos para evitar falsos positivos
  var PEDAGOGICAL_STOPWORDS = new Set([
    'simple', 'past', 'present', 'perfect', 'continuous', 'future', 'listening', 'reading', 'writing', 'speaking',
    'grammar', 'vocabulary', 'english', 'ingles', 'portugues', 'português', 'matematica', 'matemática', 'ciencias',
    'ciências', 'historia', 'história', 'geografia', 'janeiro', 'fevereiro', 'marco', 'março', 'abril', 'maio',
    'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'segunda', 'terca', 'terça',
    'quarta', 'quinta', 'sexta', 'sabado', 'sábado', 'domingo', 'atencao', 'atenção', 'dificuldade', 'facilidade',
    'excelente', 'frequencia', 'frequência', 'avaliacao', 'avaliação', 'prova', 'simulado', 'atividade',
    'escola', 'turma', 'sala', 'aula', 'colegio', 'colégio', 'professor', 'professora', 'diretoria', 'coordenacao',
    'coordenação', 'secretaria', 'nota', 'recuperacao', 'recuperação', 'reforco', 'reforço', 'conselho', 'reuniao',
    'reunião', 'ata', 'diario', 'diário', 'unidade', 'capitulo', 'capítulo', 'livro', 'aluno', 'aluna', 'alunos',
    'estudante', 'estudantes', 'portal', 'painel', 'sistema', 'menu', 'aba', 'link', 'relatorio', 'relatório',
    'dias', 'costa', 'lima', 'rosa', 'ramos', 'vale', 'porto', 'leite', 'reis', 'neves', 'moraes', 'moura',
    'matos', 'brito', 'campos', 'fontes', 'rios', 'marques', 'franco', 'salvador', 'brasil', 'silva', 'santos',
    'sousa', 'souza', 'oliveira', 'pereira', 'carvalho', 'ferreira', 'alves', 'cunha', 'vieira', 'cardoso'
  ]);

  var SENSITIVE_DOM_ROLES = new Set([
    'student_card',
    'student_row',
    'attendance_input',
    'grade_input',
    'score_cell',
    'roster_item',
    'student_profile'
  ]);

  function normalizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function EgressSecurityError(message, violations) {
    this.name = 'EgressSecurityError';
    this.message = message || 'Bloqueio de segurança LGPD: dados pessoais detectados no payload de saída';
    this.violations = violations || [];
    this.stack = (new Error(this.message)).stack;
  }
  EgressSecurityError.prototype = Object.create(Error.prototype);
  EgressSecurityError.prototype.constructor = EgressSecurityError;

  function UnresolvedTokenError(message, token, toolName) {
    this.name = 'UnresolvedTokenError';
    this.message = message || 'Token sem correspondência no desmascaramento de ferramenta de escrita.';
    this.token = token || '';
    this.toolName = toolName || '';
    this.stack = (new Error(this.message)).stack;
  }
  UnresolvedTokenError.prototype = Object.create(Error.prototype);
  UnresolvedTokenError.prototype.constructor = UnresolvedTokenError;

  var WRITING_TOOLS = new Set([
    'portal_click',
    'portal_set_select',
    'execute_portal_action',
    'confirm_portal_submission',
    'fill_school_portal',
    'lancar_nota',
    'post_grade',
    'sync_portal_data_to_app',
    'create_calendar_task',
    'create_communication',
    'record_private_tutoring_session',
    'write_portal'
  ]);

  var UNRESOLVED_TOKEN_REGEX = /\[(?:ALUNO|CPF|TELEFONE|EMAIL)_\d+\]/g;

  /**
   * Coleta nomes de alunos conhecidos de parâmetros ou storage local
  /**
   * Remove prefixos comuns de exportação de portais ("Estudante: 28 - ", "Aluno: 01 - ", etc)
   */
  function cleanRosterName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .replace(/^(?:Estudante|Aluno|Matr[ií]cula)?\s*[:#\d\s\-\.]*[-–:]\s*/i, '')
      .replace(/^(?:Estudante|Aluno|Matr[ií]cula)\s*:\s*/i, '')
      .replace(/^\d+[\.\)]\s*/, '')
      .trim();
  }

  /**
   * Coleta nomes de alunos conhecidos de parâmetros ou storage local
   */
  function extractKnownStudentNames(knownStudents) {
    var names = new Set();
    function addName(raw) {
      if (!raw || typeof raw !== 'string') return;
      var trimmed = raw.trim();
      if (trimmed.length >= 2) names.add(trimmed);
      var cleaned = cleanRosterName(trimmed);
      if (cleaned && cleaned.length >= 2) names.add(cleaned);
    }

    if (Array.isArray(knownStudents)) {
      for (var i = 0; i < knownStudents.length; i++) {
        var s = knownStudents[i];
        var n = typeof s === 'string' ? s : (s && s.name ? s.name : '');
        addName(n);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        var rawMem = localStorage.getItem('teacher_student_memory');
        if (rawMem) {
          var parsedMem = JSON.parse(rawMem);
          if (Array.isArray(parsedMem)) {
            parsedMem.forEach(function (m) {
              if (m.studentName) addName(m.studentName);
            });
          }
        }
        var rawStu = localStorage.getItem('teacher_students');
        if (rawStu) {
          var parsedStu = JSON.parse(rawStu);
          if (Array.isArray(parsedStu)) {
            parsedStu.forEach(function (st) {
              var sname = typeof st === 'string' ? st : (st && st.name ? st.name : '');
              if (sname) addName(sname);
            });
          }
        }
      } catch (e) {}
    }

    return Array.from(names);
  }

  /**
   * Anonimiza dados pessoais em uma string de texto
   */
  function maskPii(text, knownStudents, session) {
    if (!text || typeof text !== 'string') {
      return {
        maskedText: text || '',
        unmask: function (s) { return s; },
        mapping: (session && session.mapping) || {},
        reverseMapping: (session && session.reverseMapping) || {},
        piiDetectedCount: 0
      };
    }

    session = session || {};
    session.mapping = session.mapping || {};
    session.reverseMapping = session.reverseMapping || {};
    session.studentCounter = session.studentCounter || 1;
    session.phoneCounter = session.phoneCounter || 1;
    session.cpfCounter = session.cpfCounter || 1;
    session.emailCounter = session.emailCounter || 1;

    var mapping = session.mapping;
    var reverseMapping = session.reverseMapping;
    var piiCount = 0;
    var processed = text;

    // 1. Nomes conhecidos (ordem decrescente de tamanho para evitar colisões)
    var studentList = extractKnownStudentNames(knownStudents);
    var candidateNames = [];

    studentList.forEach(function (rawName) {
      if (!rawName) return;
      candidateNames.push(rawName);
      var cleaned = cleanRosterName(rawName);
      if (cleaned && cleaned !== rawName) {
        candidateNames.push(cleaned);
      }

      var target = cleaned || rawName;
      var parts = target.trim().split(/\s+/);

      // Composto dos dois primeiros nomes (ex: "Ana Clara", "Maria Clara", "Marcos Paulo")
      if (parts.length >= 2) {
        var comp = parts[0] + ' ' + parts[1];
        if (comp.length >= 5 && !PEDAGOGICAL_STOPWORDS.has(comp.toLowerCase())) {
          candidateNames.push(comp);
        }
      }

      // Adiciona todas as partes individuais de nome com >= 3 caracteres (sem stopwords)
      parts.forEach(function (p) {
        var pClean = p.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
        if (pClean.length >= 3 && !PEDAGOGICAL_STOPWORDS.has(pClean.toLowerCase())) {
          candidateNames.push(pClean);
        }
      });
    });

    candidateNames.sort(function (a, b) { return b.length - a.length; });

    // Deduplica candidatos
    var uniqueCandidates = [];
    var seen = new Set();
    candidateNames.forEach(function (c) {
      var norm = normalizeText(c);
      if (!seen.has(norm)) {
        seen.add(norm);
        uniqueCandidates.push(c);
      }
    });

    function buildAccentInsensitiveRegex(cand) {
      var norm = normalizeText(cand);
      var pattern = '';
      for (var i = 0; i < norm.length; i++) {
        var ch = norm[i];
        if (ch === 'a') pattern += '[aàáâãäå]';
        else if (ch === 'e') pattern += '[eèéêë]';
        else if (ch === 'i') pattern += '[iìíîï]';
        else if (ch === 'o') pattern += '[oòóôõö]';
        else if (ch === 'u') pattern += '[uùúûü]';
        else if (ch === 'c') pattern += '[cç]';
        else if (ch === 'n') pattern += '[nñ]';
        else if (/\s/.test(ch)) pattern += '\\s+';
        else pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      return new RegExp('(^|[^A-Za-zÀ-ÖØ-öø-ÿ0-9])(' + pattern + ')(?=[^A-Za-zÀ-ÖØ-öø-ÿ0-9]|$)', 'gi');
    }

    uniqueCandidates.forEach(function (cand) {
      var normCand = normalizeText(cand);
      if (PEDAGOGICAL_STOPWORDS.has(cand.toLowerCase()) || PEDAGOGICAL_STOPWORDS.has(normCand) || normCand.length < 3) return;
      var regex = buildAccentInsensitiveRegex(cand);

      if (regex.test(processed)) {
        if (!reverseMapping[normCand]) {
          var token = '[ALUNO_' + (session.studentCounter++) + ']';
          mapping[token] = cand;
          reverseMapping[normCand] = token;
        }
        var assignedToken = reverseMapping[normCand];
        regex.lastIndex = 0;
        processed = processed.replace(regex, function (match, prefix) {
          piiCount++;
          return prefix + assignedToken;
        });
      }
    });

    // 2. CPFs
    processed = processed.replace(CPF_REGEX, function (match) {
      // Ignora datas (ex: 20260930) ou sequências repetidas não-CPF se aplicável
      if (match.length < 11) return match;
      if (!reverseMapping[match]) {
        var token = '[CPF_' + (session.cpfCounter++) + ']';
        mapping[token] = match;
        reverseMapping[match] = token;
      }
      piiCount++;
      return reverseMapping[match];
    });

    // 3. Telefones
    processed = processed.replace(PHONE_REGEX, function (match) {
      if (match.length < 8 || /^(19|20)\d{2}$/.test(match.trim())) return match;
      if (!reverseMapping[match]) {
        var token = '[TELEFONE_' + (session.phoneCounter++) + ']';
        mapping[token] = match;
        reverseMapping[match] = token;
      }
      piiCount++;
      return reverseMapping[match];
    });

    // 4. E-mails
    processed = processed.replace(EMAIL_REGEX, function (match) {
      if (!reverseMapping[match]) {
        var token = '[EMAIL_' + (session.emailCounter++) + ']';
        mapping[token] = match;
        reverseMapping[match] = token;
      }
      piiCount++;
      return reverseMapping[match];
    });

    var unmask = function (aiResponse) {
      return unmaskPii(aiResponse, session);
    };

    return {
      maskedText: processed,
      unmask: unmask,
      mapping: mapping,
      reverseMapping: reverseMapping,
      piiDetectedCount: piiCount
    };
  }

  /**
   * Desmascara tokens restaurando os valores originais
   */
  function unmaskPii(text, sessionOrMapping) {
    if (!text || typeof text !== 'string') return text || '';
    var map = (sessionOrMapping && sessionOrMapping.mapping) ? sessionOrMapping.mapping : (sessionOrMapping || {});
    var restored = text;
    for (var token in map) {
      if (Object.prototype.hasOwnProperty.call(map, token)) {
        restored = restored.split(token).join(map[token]);
      }
    }
    return restored;
  }

  /**
   * Desmascara argumentos em chamadas de ferramenta antes da execução no DOM
   */
  function unmaskToolUse(toolUse, session) {
    if (!Array.isArray(toolUse)) return toolUse;
    return toolUse.map(function (tu) {
      if (!tu || !tu.input || typeof tu.input !== 'object') return tu;
      var unmaskedInput = {};
      for (var k in tu.input) {
        if (Object.prototype.hasOwnProperty.call(tu.input, k)) {
          var val = tu.input[k];
          if (typeof val === 'string') {
            unmaskedInput[k] = unmaskPii(val, session);
          } else if (val && typeof val === 'object') {
            try {
              unmaskedInput[k] = JSON.parse(unmaskPii(JSON.stringify(val), session));
            } catch (e) {
              unmaskedInput[k] = val;
            }
          } else {
            unmaskedInput[k] = val;
          }
        }
      }

      var toolName = tu.name || tu.id || '';
      var isWriting = WRITING_TOOLS.has(toolName) || /click|select|fill|write|lancar|post|sync|record|submit|create/i.test(toolName);
      if (isWriting) {
        var serialized = JSON.stringify(unmaskedInput);
        var unresolvedMatches = serialized.match(UNRESOLVED_TOKEN_REGEX);
        if (unresolvedMatches && unresolvedMatches.length > 0) {
          throw new UnresolvedTokenError(
            'Token sem correspondência no desmascaramento de ferramenta de escrita (' + toolName + '): ' + unresolvedMatches.join(', ') + '. Operação bloqueada para evitar gravação de token literal no portal.',
            unresolvedMatches[0],
            toolName
          );
        }
      }

      return Object.assign({}, tu, { input: unmaskedInput });
    });
  }

  /**
   * Sanitiza estruturalmente elementos capturados do DOM
   * Camada 1: Elementos de tabela de alunos, inputs de nota/falta e cards são sensíveis por papel
   */
  function structurallySanitizeElements(elements) {
    if (!Array.isArray(elements)) return [];
    return elements.filter(function (el) {
      if (!el) return false;
      var role = (el.role || '').toLowerCase();
      var tag = (el.tag || '').toLowerCase();
      var ref = (el.ref || '').toLowerCase();
      var text = (el.text || '').toLowerCase();
      var className = (el.className || el.class || '').toLowerCase();

      // Papéis sensíveis bloqueados categoricamente
      if (SENSITIVE_DOM_ROLES.has(role)) return false;

      // Inputs de chamada ou avaliação
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (ref.includes('nota') || ref.includes('falta') || ref.includes('presenca') ||
            ref.includes('frequencia') || ref.includes('aluno') || ref.includes('grade')) {
          return false;
        }
      }

      // Linhas ou células de tabela com notas/faltas
      if (tag === 'td' || tag === 'tr' || className.includes('roster') || className.includes('aluno')) {
        if (text.includes('nota') || text.includes('falta') || text.includes('presença') || text.includes('chamada')) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Mascara recursivamente todo o histórico de mensagens mantendo tokens consistentes
   */
  function maskChatHistory(messages, knownStudents, session) {
    if (!Array.isArray(messages)) return { maskedMessages: [], session: session || {} };
    session = session || { mapping: {}, reverseMapping: {}, studentCounter: 1, phoneCounter: 1, cpfCounter: 1, emailCounter: 1 };

    var maskedMessages = messages.map(function (m) {
      var copy = Object.assign({}, m);
      if (typeof copy.content === 'string') {
        copy.content = maskPii(copy.content, knownStudents, session).maskedText;
      }

      if (Array.isArray(copy.toolResults)) {
        copy.toolResults = copy.toolResults.map(function (tr) {
          var trCopy = Object.assign({}, tr);
          if (typeof trCopy.result === 'string') {
            try {
              var parsed = JSON.parse(trCopy.result);
              // Sanitização estrutural se contiver elementos DOM
              if (parsed && Array.isArray(parsed.elements)) {
                parsed.elements = structurallySanitizeElements(parsed.elements);
              }
              if (parsed && Array.isArray(parsed.students)) {
                parsed.students_count = parsed.students.length;
                delete parsed.students;
                delete parsed.sample;
              }
              trCopy.result = maskPii(JSON.stringify(parsed), knownStudents, session).maskedText;
            } catch (e) {
              trCopy.result = maskPii(trCopy.result, knownStudents, session).maskedText;
            }
          }
          return trCopy;
        });
      }

      return copy;
    });

    return {
      maskedMessages: maskedMessages,
      session: session
    };
  }

  /**
   * Inspeciona payload de saída para nuvem e bloqueia se houver qualquer PII
   * Ponto único de validação Egress (Zero-PII Gateway)
   */
  function guardEgress(body, activeRoster) {
    if (!body) return;
    var violations = [];
    var stringified = '';
    if (typeof body === 'string') {
      stringified = body;
    } else if (body && typeof body.forEach === 'function' && typeof body.append === 'function') {
      var parts = [];
      body.forEach(function (val, key) {
        if (typeof val === 'string') {
          parts.push(key + '=' + val);
        } else if (val && val.name) {
          parts.push(key + '=' + val.name);
        }
      });
      stringified = parts.join(';');
    } else {
      stringified = JSON.stringify(body) || '';
    }
    var lowerNorm = normalizeText(stringified);

    // 1. Defesa Estrutural: verifica papéis sensíveis no JSON
    SENSITIVE_DOM_ROLES.forEach(function (role) {
      if (stringified.indexOf('"' + role + '"') !== -1 || stringified.indexOf("'" + role + "'") !== -1) {
        violations.push('STRUCTURAL_SENSITIVE_ROLE: ' + role);
      }
    });

    // 2. Validação contra lista de alunos da turma ativa (Canary / Active Class Roster)
    var roster = extractKnownStudentNames(activeRoster);
    var seenViolations = new Set();
    roster.forEach(function (studentName) {
      if (!studentName || studentName.trim().length < 3) return;
      var cleanedName = cleanRosterName(studentName);
      var targetName = (cleanedName && cleanedName.length >= 3) ? cleanedName : studentName;
      var normStudent = normalizeText(targetName);
      if (PEDAGOGICAL_STOPWORDS.has(normStudent)) return;

      // Busca por nome completo ou por partes individuais (>= 4 letras)
      var escaped = normStudent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var fullRegex = new RegExp('(?:\\b|[\\/_=-])' + escaped + '(?:\\b|[\\/_=-])', 'i');
      if (fullRegex.test(lowerNorm)) {
        var v = 'ACTIVE_ROSTER_STUDENT_DETECTED: ' + targetName;
        if (!seenViolations.has(v)) {
          seenViolations.add(v);
          violations.push(v);
        }
      } else {
        var parts = normStudent.split(/\s+/);
        if (parts.length > 1) {
          parts.forEach(function (p) {
            var pClean = p.replace(/[^a-z0-9]/g, '');
            if (pClean.length >= 4 && !PEDAGOGICAL_STOPWORDS.has(pClean)) {
              var partRegex = new RegExp('(?:\\b|[\\/_=-])' + pClean + '(?:\\b|[\\/_=-])', 'i');
              if (partRegex.test(lowerNorm)) {
                var vPart = 'ACTIVE_ROSTER_STUDENT_PART_DETECTED: ' + pClean + ' (' + targetName + ')';
                if (!seenViolations.has(vPart)) {
                  seenViolations.add(vPart);
                  violations.push(vPart);
                }
              }
            }
          });
        }
      }
    });

    // 3. CPF (com ou sem pontuação ou barra)
    var cpfMatch = stringified.match(CPF_REGEX);
    if (cpfMatch) {
      cpfMatch.forEach(function (m) {
        // Valida se são 11 dígitos ou formato com pontuação
        var digitsOnly = m.replace(/\D/g, '');
        if (digitsOnly.length === 11) {
          violations.push('CPF_DETECTED: ' + m);
        }
      });
    }

    // 4. Telefone
    var phoneMatch = stringified.match(PHONE_REGEX);
    if (phoneMatch) {
      phoneMatch.forEach(function (m) {
        if (m.length >= 8 && !/^(19|20)\d{2}$/.test(m.trim())) {
          violations.push('PHONE_DETECTED: ' + m);
        }
      });
    }

    // 5. E-mail
    var emailMatch = stringified.match(EMAIL_REGEX);
    if (emailMatch) {
      emailMatch.forEach(function (m) {
        violations.push('EMAIL_DETECTED: ' + m);
      });
    }

    if (violations.length > 0) {
      throw new EgressSecurityError('Bloqueio Egress LGPD: ' + violations.join('; '), violations);
    }
  }

  return {
    maskPii: maskPii,
    unmaskPii: unmaskPii,
    maskChatHistory: maskChatHistory,
    unmaskToolUse: unmaskToolUse,
    structurallySanitizeElements: structurallySanitizeElements,
    guardEgress: guardEgress,
    EgressSecurityError: EgressSecurityError,
    UnresolvedTokenError: UnresolvedTokenError
  };
}));
