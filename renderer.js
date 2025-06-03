// renderer.js

let config = {
  headerRow: 0,
  excelPath: '',
  mensagemPath: '',
  useSession: true
};

const startButton = document.getElementById('start-btn');
const excelPathElement = document.getElementById('excel-path');
const messagePathElement = document.getElementById('message-path');
const logsDiv = document.getElementById('logs');
const qrImage = document.getElementById('qr-code');
const qrContainer = document.getElementById('qr-container');
const sessionContainer = document.getElementById('session-container');
const useSessionCheckbox = document.getElementById('use-session-checkbox');

async function selectExcel() {
  try {
    const path = await window.electronAPI.selectFile({
      filters: [{ name: 'Planilhas Excel', extensions: ['xls', 'xlsx'] }]
    });
    if (path) {
      config.excelPath = path;
      excelPathElement.textContent = config.excelPath;
    }
  } catch (error) {
    showError(`Erro ao selecionar planilha: ${error.message}`);
  }
}

async function selectMessage() {
  try {
    const path = await window.electronAPI.selectFile({
      filters: [{ name: 'Arquivos de Texto', extensions: ['txt'] }]
    });
    if (path) {
      config.mensagemPath = path;
      messagePathElement.textContent = config.mensagemPath;
    }
  } catch (error) {
    showError(`Erro ao selecionar mensagem: ${error.message}`);
  }
}

async function startBot() {
  try {
    const headerRowInput = document.getElementById('linhas-cabecalho').value;
    if (headerRowInput === '') {
      throw new Error('Informe a linha do cabeçalho!');
    }
    config.headerRow = parseInt(headerRowInput, 10);
    if (isNaN(config.headerRow)) {
      throw new Error('O número da linha do cabeçalho é inválido!');
    }

    if (!config.excelPath || !config.mensagemPath) {
      throw new Error('Selecione o arquivo Excel e o arquivo de mensagem!');
    }
    
    debugger
    config.useSession = useSessionCheckbox.checked;

    toggleButton(true, 'Processando...');
    qrContainer.style.display = 'none';
    
    // ✅ CORREÇÃO: Adicionado 'await' e bloco try/finally para controle do botão
    await window.electronAPI.startBot(config);

  } catch (error) {
    showError(error.message);
  } finally {
    // Este bloco garante que o botão seja reativado ao final do processo
    toggleButton(false, 'Iniciar Envio');
  }
}

function addLog(message, type = 'info') {
  const logElement = document.createElement('div');
  logElement.className = `log log-${type}`;
  logElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logsDiv.appendChild(logElement);
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

function toggleButton(disabled, text) {
  startButton.disabled = disabled;
  startButton.textContent = text;
}

function showError(message) {
  addLog(message, 'error');
  alert(message);
}

document.addEventListener('DOMContentLoaded', () => {
  window.electronAPI.checkSession().then(sessionExists => {
    if (sessionExists) {
      sessionContainer.style.display = 'block';
    }
  });

  window.electronAPI.onLogMessage((_, message) => {
    addLog(message);
  });

  window.electronAPI.onQRCode((_, qrDataURL) => {
    qrImage.src = qrDataURL;
    qrContainer.style.display = 'block';
    addLog('Aguardando leitura do QR Code...');
  });
});