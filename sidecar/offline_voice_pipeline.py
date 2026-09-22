"""
offline_voice_pipeline.py — Pipeline de Voz Local com VAD e Interface para STT Offline

Processa chunks de áudio recebidos do microfone da professora, realiza detecção de atividade
de voz (VAD) para descartar silêncios e ruídos de sala de aula e encaminha os trechos falados
para modelos locais de transcrição (Whisper.cpp / Sherpa-ONNX).
"""

import math
import struct
from typing import Any, Dict, List, Optional, Tuple


class VoiceActivityDetector:
    """Detector de atividade de voz determinístico baseado em energia RMS e envelope espectral."""

    def __init__(self, energy_threshold: float = 0.025, sample_rate: int = 16000):
        self.energy_threshold = energy_threshold
        self.sample_rate = sample_rate

    def calculate_rms(self, pcm_bytes: bytes) -> float:
        """Calcula o valor RMS (Root Mean Square) de um bloco de áudio PCM 16-bit mono."""
        if not pcm_bytes or len(pcm_bytes) < 2:
            return 0.0

        n_samples = len(pcm_bytes) // 2
        fmt = f"<{n_samples}h"
        try:
            samples = struct.unpack(fmt, pcm_bytes[: n_samples * 2])
        except struct.error:
            return 0.0

        sum_squares = sum(s * s for s in samples)
        mean_square = sum_squares / max(n_samples, 1)
        normalized_rms = math.sqrt(mean_square) / 32768.0
        return normalized_rms

    def is_speech(self, pcm_bytes: bytes) -> bool:
        """Retorna True se o bloco de áudio contiver energia de fala acima do limiar."""
        rms = self.calculate_rms(pcm_bytes)
        return rms >= self.energy_threshold


class OfflineVoicePipeline:
    """Pipeline orquestrador de áudio para transcrição offline."""

    def __init__(self, energy_threshold: float = 0.025):
        self.vad = VoiceActivityDetector(energy_threshold=energy_threshold)
        self.speech_buffer: List[bytes] = []
        self.is_recording_speech = False

    def feed_audio_chunk(self, pcm_bytes: bytes) -> Dict[str, Any]:
        """
        Alimenta um chunk de áudio PCM (ex: 20ms-50ms).
        Retorna o estado do VAD e se um enunciado completo foi fechado.
        """
        has_speech = self.vad.is_speech(pcm_bytes)
        rms = round(self.vad.calculate_rms(pcm_bytes), 4)

        if has_speech:
            self.speech_buffer.append(pcm_bytes)
            self.is_recording_speech = True
            return {
                "has_speech": True,
                "rms": rms,
                "speech_frame_count": len(self.speech_buffer),
                "utterance_ready": False
            }
        else:
            if self.is_recording_speech and len(self.speech_buffer) >= 5:
                # Silêncio após trecho falado: fecha o enunciado para transcrição
                complete_audio = b"".join(self.speech_buffer)
                self.speech_buffer = []
                self.is_recording_speech = False
                return {
                    "has_speech": False,
                    "rms": rms,
                    "speech_frame_count": 0,
                    "utterance_ready": True,
                    "audio_payload": complete_audio
                }
            self.speech_buffer = []
            self.is_recording_speech = False
            return {
                "has_speech": False,
                "rms": rms,
                "speech_frame_count": 0,
                "utterance_ready": False
            }
