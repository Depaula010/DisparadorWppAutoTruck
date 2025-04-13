// renderer.js

// ========== DECLARAÇÃO DA CONFIGURAÇÃO ==========
let config = {
  headerRow: 0,
  excelPath: '',
  mensagemPath: '',
  relatorios: '' // Será preenchido via IPC
};

// ========== ELEMENTOS DA INTERFACE ==========
const startButton = document.getElementById('start-btn');
const excelPathElement = document.getElementById('excel-path');
const messagePathElement = document.getElementById('message-path');
const logsDiv = document.getElementById('logs');
const qrImage = document.getElementById('qr-code');
const qrContainer = document.getElementById('qr-container');

// ========== FUNÇÕES DE SELEÇÃO DE ARQUIVOS ==========
async function selectExcel() {
  try {
    config.excelPath = await window.electronAPI.selectFile({
      filters: [{ name: 'Planilhas Excel', extensions: ['xls', 'xlsx'] }]
    });
    excelPathElement.textContent = config.excelPath;
  } catch (error) {
    showError(`Erro ao selecionar planilha: ${error.message}`);
  }
}

async function selectMessage() {
  try {
    config.mensagemPath = await window.electronAPI.selectFile({
      filters: [{ name: 'Arquivos de Texto', extensions: ['txt'] }]
    });
    messagePathElement.textContent = config.mensagemPath;
  } catch (error) {
    showError(`Erro ao selecionar mensagem: ${error.message}`);
  }
}

// ========== CONTROLE PRINCIPAL ==========
async function startBot() {
  try {

    const headerRowInput = document.getElementById('linhas-cabecalho').value;
    const parsedRow = parseInt(headerRowInput, 10);
    if (isNaN(parsedRow)) {
      throw new Error('Informe um número válido para a linha do cabeçalho!');
    }
    config.headerRow = parsedRow;

    // Validar seleção de arquivos
    if (!config.excelPath || !config.mensagemPath) {
      throw new Error('Selecione ambos os arquivos antes de iniciar!');
    }

    // Configurar listeners
    window.electronAPI.onLogMessage((_, message) => {
      addLog(message);
    });

    window.electronAPI.onQRCode((_, qrDataURL) => {
      qrImage.src = qrDataURL;
      qrContainer.style.display = 'block';
    });

    // Iniciar processo
    toggleButton(true, 'Processando...');
    await window.electronAPI.startBot(config);

  } catch (error) {
    showError(error.message);
  } finally {
    toggleButton(false, 'Iniciar Envio');
    qrContainer.style.display = 'none';
  }
}

// ========== FUNÇÕES AUXILIARES ==========
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

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', () => {
  // Obter caminho de relatórios do main process
  window.electronAPI.getReportsDir().then(dir => {
    config.relatorios = dir;
  });

  // Event listeners
  startButton.addEventListener('click', startBot);
});