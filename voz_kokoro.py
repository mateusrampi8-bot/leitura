# Servidor de voz natural - Kokoro + Piper (pt-BR) - roda em 127.0.0.1:8123
# Kokoro: ~/.kokoro/kokoro-v1.0.onnx + voices-v1.0.bin (ja baixados)
# Piper:  ~/.piper/pt_BR-*.onnx (baixados de huggingface.co/rhasspy/piper-voices)
import io
import os
import sys
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import soundfile as sf
from misaki import espeak
from kokoro_onnx import Kokoro

try:
    from piper import PiperVoice, SynthesisConfig
    PIPER_OK = True
except Exception:  # piper opcional: servidor continua so com Kokoro
    PIPER_OK = False

BASE = os.path.join(os.path.expanduser('~'), '.kokoro')
MODELO = os.path.join(BASE, 'kokoro-v1.0.onnx')
VOICES = os.path.join(BASE, 'voices-v1.0.bin')
PIPER_DIR = os.path.join(os.path.expanduser('~'), '.piper')
PORTA = 8123
VOZES_PT = ('pf_dora', 'pm_alex', 'pm_santa')
VOZES_PIPER = {
    'cadu': 'pt_BR-cadu-medium.onnx',
    'edresson': 'pt_BR-edresson-low.onnx',
    'faber': 'pt_BR-faber-medium.onnx',
    'jeff': 'pt_BR-jeff-medium.onnx',
}
# apenas vozes realmente disponiveis no disco
VOZES_PIPER_OK = {
    nome: arq for nome, arq in VOZES_PIPER.items()
    if PIPER_OK and os.path.exists(os.path.join(PIPER_DIR, arq))
}
VOZES_AUDIO = (
    ['kokoro:' + v for v in VOZES_PT] +
    ['piper:' + v for v in VOZES_PIPER_OK]
)

_lock = threading.Lock()
_cache = {}
_cache_ordem = []
_piper_cache = {}   # nome -> PiperVoice (LRU, no maximo 2 carregados)
_piper_ordem = []


def carregar():
    kokoro = Kokoro(MODELO, VOICES)
    g2p = espeak.EspeakG2P(language='pt-br')
    return kokoro, g2p


KOKORO, G2P = carregar()


def normalizar_voz(voz):
    """'kokoro:pf_dora', 'piper:faber' ou nome cru -> (engine, nome)."""
    if voz.startswith('kokoro:'):
        voz = voz[7:]
        return ('kokoro', voz if voz in VOZES_PT else 'pf_dora')
    if voz.startswith('piper:'):
        nome = voz[6:]
        if nome in VOZES_PIPER_OK:
            return ('piper', nome)
        alternativas = list(VOZES_PIPER_OK)
        return ('piper', alternativas[0] if alternativas else '')
    return ('kokoro', voz if voz in VOZES_PT else 'pf_dora')


def _voz_piper(nome):
    if nome in _piper_cache:
        _piper_ordem.remove(nome)
        _piper_ordem.append(nome)
        return _piper_cache[nome]
    caminho = os.path.join(PIPER_DIR, VOZES_PIPER_OK[nome])
    voz = PiperVoice.load(caminho)
    _piper_cache[nome] = voz
    _piper_ordem.append(nome)
    while len(_piper_ordem) > 2:            # evita carregar 4 modelos na RAM juntos
        velho = _piper_ordem.pop(0)
        _piper_cache.pop(velho, None)
    return voz


def _sintetizar_piper(texto, nome, vel):
    voz = _voz_piper(nome)
    cfg = SynthesisConfig(length_scale=1.0 / vel)   # length_scale = inverso da velocidade
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        voz.synthesize_wav(texto, w, syn_config=cfg)
    return buf.getvalue()


def sintetizar(texto, voz, vel):
    engine, nome = normalizar_voz(voz)
    if not nome:
        raise RuntimeError('nenhuma voz Piper disponível')
    chave = (engine, texto, nome, vel)
    if chave in _cache:
        return _cache[chave]
    with _lock:
        if chave in _cache:
            return _cache[chave]
        if engine == 'piper':
            dados = _sintetizar_piper(texto, nome, vel)
        else:
            fonemas, _ = G2P(texto)
            amostras, taxa = KOKORO.create(fonemas, nome, vel, is_phonemes=True)
            buf = io.BytesIO()
            sf.write(buf, amostras, taxa, format='WAV', subtype='PCM_16')
            dados = buf.getvalue()
    _cache[chave] = dados
    _cache_ordem.append(chave)
    while len(_cache_ordem) > 250:
        velho = _cache_ordem.pop(0)
        _cache.pop(velho, None)
    return dados


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, obj, codigo=200):
        corpo = __import__('json').dumps(obj).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/status':
            self._json({'pronto': True, 'vozes': VOZES_AUDIO})
            return
        if u.path != '/sintese':
            self._json({'erro': 'rota desconhecida'}, 404)
            return
        q = parse_qs(u.query)
        texto = (q.get('texto', [''])[0] or '').strip()
        voz = q.get('voz', ['kokoro:pf_dora'])[0]
        try:
            vel = float(q.get('vel', ['1'])[0])
        except ValueError:
            vel = 1.0
        vel = max(0.5, min(2.0, vel))
        if not texto:
            self._json({'erro': 'texto vazio'}, 400)
            return
        try:
            dados = sintetizar(texto[:1500], voz, vel)
        except Exception as e:  # noqa: BLE001
            self._json({'erro': 'falha na síntese: ' + str(e)}, 500)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'audio/wav')
        self.send_header('Content-Length', str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    servidor = ThreadingHTTPServer(('127.0.0.1', PORTA), Handler)
    print('PRONTO', flush=True)
    servidor.serve_forever()


if __name__ == '__main__':
    main()
