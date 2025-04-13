// bot-core.js
const { Client, LocalAuth, NoAuth } = require('whatsapp-web.js');
const XLSX = require('xlsx');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const configJson = require('./config.json');
const puppeteer = require('puppeteer-core');

// ========== CONFIGURAÇÕES ==========

const AUTH_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTTGckb-3zRCzzV0dYKjJDSlgUYiwy8fL0N_sMYDJgfrwuDhHap1x4QyvI_z9kvy4TF_q0mRh5UCl3B/pub?gid=0&single=true&output=csv';
const EXCEL_CONFIG = {
    headerRow: 7,
    dataStartRow: 8,
    columns: {
        nome: 'Nome',
        telefone: 'Telefone Celular',
        linha: 'Linha Digitavel'
    }
};

// Variáveis de estado
let state = {
    startTime: new Date(),
    endTime: null,
    successCount: 0,
    errorCount: 0,
    errors: [],
    lastValidName: null,
    checkpoint: 0
};


const getBiosSerial = () => {
    try {
        return process.platform === 'win32'
            ? execSync('wmic bios get serialnumber').toString().split('\n')[1].trim()
            : execSync('dmidecode -s system-serial-number').toString().trim();
    } catch (error) {
        console.error('Erro ao obter serial do BIOS:', error);
        return null;
    }
};

const validateAuthorization = async () => {
    try {
        const response = await axios.get(AUTH_SHEET_URL);
        const authData = parse(response.data, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
        const biosSerial = getBiosSerial();

        return authData.some(row =>
            row.UUID === '7c05a4b4-29d0-4dcf-8179-a35f413b3c74' &&
            row.BIOS_SERIAL === biosSerial &&
            row.STATUS === '1'
        );
    } catch (error) {
        console.error('Erro na validação de autorização:', error);
        return false;
    }
};


const USER_DATA_DIR = path.join(
    require('electron').app.getPath('documents'),
    'ReminderTrigger'
);

const reportPath = path.join(USER_DATA_DIR, 'relatorios');

// Caminho absoluto para o diretório do projeto
const PROJECT_DIR = __dirname; // __dirname é o diretório do arquivo atual (geralmente a raiz do projeto)
const CHECKPOINT_FILE = path.join(PROJECT_DIR, 'checkpoint.json');

// ========== HELPERS ==========
const getChromiumPath = () => {
    const appPath = require('electron').app.isPackaged
        ? path.join(path.dirname(require('electron').app.getPath('exe')), 'resources')
        : __dirname;

    return path.join(
        appPath,
        'puppeteer-chromium',
        'win64-1083080', // Mantenha esse nome exato
        'chrome-win',
        'chrome.exe'
    );
};

// ========== LÓGICA PRINCIPAL ==========
module.exports.runBot = async (mainWindow, config) => {
    // Configurar diretórios
    if (!fs.existsSync(USER_DATA_DIR)) {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    // Configurar cliente WhatsApp
    const client = new Client({
        authStrategy: new NoAuth(),
        puppeteer: {
            headless: "new",
            executablePath: getChromiumPath(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        }
    });

    // ========== HANDLERS ==========

    client.on('qr', async qr => {
        const qrDataURL = await QRCode.toDataURL(qr);
        mainWindow.webContents.send('qr-code', qrDataURL); // 👈 Evento correto
    });

    client.on('auth_failure', msg => {
        mainWindow.webContents.send('log-message', `❌ Falha na autenticação: ${msg}`);
    });

    // ========== FLUXO DE EXECUÇÃO ==========
    await client.initialize();

    await new Promise(resolve => {
        client.on('ready', () => {
            mainWindow.webContents.send('log-message', '✅ WhatsApp conectado!');
            resolve();
        });
    });

    // if (!(await validateAuthorization())) {
    //     mainWindow.webContents.send('log-message', `❌ Não autorizado para executar esta operação`);
    // }


    try {
        mainWindow.webContents.send('log-message', `⏳ Dispositivo autenticado. Validando autorização...`);

        // if (!(await validateAuthorization())) {
        //   throw new Error('Não autorizado para executar esta operação');
        // }

        mainWindow.webContents.send('log-message', `Autorização validada. Carregando dados...`);

        const workbook = XLSX.readFile(config.excelPath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const dados = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        EXCEL_CONFIG.header = dados[EXCEL_CONFIG.headerRow].map(c => c?.toString().trim());
        state.checkpoint = (await loadCheckpoint()).lastRow;

        mainWindow.webContents.send('log-message', `🚀 Iniciando envio a partir da linha ${state.checkpoint + 1}`);

        while (state.checkpoint < dados.length) {
            const batchRows = dados.slice(
                state.checkpoint,
                state.checkpoint + configJson.batchSize
            );

            await processBatch(batchRows, worksheet, mainWindow, client, config);
            state.checkpoint += configJson.batchSize;

            await saveCheckpoint(state.checkpoint);

            // Delay entre lotes
            const delay = Math.random() *
                (configJson.maxDelaySeconds - configJson.minDelaySeconds) +
                configJson.minDelaySeconds;

            mainWindow.webContents.send('log-message', `⏳ Aguardando ${delay.toFixed(2)} segundos...`);
            await new Promise(resolve =>
                setTimeout(resolve, delay * 1000));
        }

        state.endTime = new Date();
        await generateReport(mainWindow);
        mainWindow.webContents.send('log-message', `✅ Processo concluído com sucesso!`);

    } catch (error) {
        mainWindow.webContents.send('log-message', `❌ Erro crítico: ${error.message}`);
        await generateReport(mainWindow);
    } finally {
        try {
            const stats = await fsp.stat(CHECKPOINT_FILE).catch(() => null);

            if (stats) {
                if (stats.isFile()) {
                    await fsp.unlink(CHECKPOINT_FILE);
                } else {
                    await fsp.rm(CHECKPOINT_FILE, { recursive: true, force: true });
                    mainWindow.webContents.send('log-message', '⚠️ Diretório inválido excluído.');
                }
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('Checkpoint não existe.');
            } else {
                mainWindow.webContents.send('log-message', `❌ Erro ao limpar checkpoint: ${error.message}`);
            }
        }
    }
};

// ========== FUNÇÕES DE PROCESSAMENTO ==========

async function processBatch(rows, worksheet, mainWindow, client, config) {
    const batchPromises = rows.map(async (row, index) => {
        const rowNumber = state.checkpoint + index + 1;
        try {
            // Processa todas as colunas da linha
            const rowData = processRow(row, rowNumber);
            const number = `55${rowData.telefone_celular}@c.us`;

            // Carrega e substitui variáveis dinamicamente
            const mensagemTemplate = await fsp.readFile(config.mensagemPath, 'utf-8');
            const message = replaceVariables(mensagemTemplate, rowData);

            await client.sendMessage(number, message);
            state.successCount++;
            mainWindow.webContents.send('log-message', `✅ [Lote] Enviado para ${rowData.nome} (Linha ${rowNumber})`);
            return true;
        } catch (error) {
            state.errorCount++;
            state.errors.push({
                linha: rowNumber,
                error: error.message,
                ...row
            });
            mainWindow.webContents.send('log-message', `❌ [Lote] Erro na linha ${rowNumber}: ${error.message}`);
            return false;
        }
    });

    return Promise.all(batchPromises);
}

function processRow(row, rowNumber) {
    const rowData = {};

    // Mapeia todas as colunas da planilha
    EXCEL_CONFIG.header.forEach((header, index) => {
        const columnKey = header.toLowerCase().replace(/ /g, '_');
        rowData[columnKey] = row[index]?.toString().trim() || '';
    });

    // Mantém a lógica de células mescladas para 'nome'
    if (!rowData.nome && state.lastValidName) {
        rowData.nome = state.lastValidName;
    } else if (rowData.nome) {
        state.lastValidName = rowData.nome;
    }

    // Validações essenciais
    rowData.telefone_celular = validatePhone(rowData.telefone_celular);

    return rowData;
}

function replaceVariables(template, data) {
    return Object.entries(data).reduce((msg, [key, value]) => {
        const regex = new RegExp(`{{${key.toUpperCase()}}}`, 'gi');
        return msg.replace(regex, value);
    }, template);
}

function validatePhone(telefone) {
    // Remove todos os caracteres não numéricos
    let cleaned = telefone.replace(/\D/g, '');
    
    // Lógica específica para números com 11 dígitos (remove o 3º dígito)
    if (cleaned.length === 11) {
        cleaned = cleaned.substring(0, 2) + cleaned.substring(3);
    }
    
    // Validação final
    if (!cleaned || ![10, 11].includes(cleaned.length)) {
        throw new Error(`Telefone inválido (${cleaned.length} dígitos)`);
    }
    
    return cleaned; // Retorna o número normalizado
}

// ========== CHECKPOINT SYSTEM ==========
async function loadCheckpoint() {
    try {
        const data = await fsp.readFile(CHECKPOINT_FILE, 'utf-8');
        const jsonData = JSON.parse(data);
        return jsonData.lastRow != null ? jsonData : { lastRow: EXCEL_CONFIG.dataStartRow };
    } catch {
        return { lastRow: EXCEL_CONFIG.dataStartRow };
    }
}

async function saveCheckpoint(lastRow) {
    const checkpointData = {
        ...state,
        lastRow,
        checkpointDate: new Date()
    };

    // Garante que o diretório do projeto existe (não é necessário criar, mas válido)
    await fsp.mkdir(PROJECT_DIR, { recursive: true });

    await fsp.writeFile(
        CHECKPOINT_FILE,
        JSON.stringify(checkpointData, null, 2)
    );
}

const formatDate = (date) => {
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium'
    }).format(date);
};

function calculateDuration(start, end) {
    const duration = end - start;
    const minutes = Math.floor(duration / 60000);
    const seconds = ((duration % 60000) / 1000).toFixed(0);
    return `${minutes} minutos e ${seconds} segundos`;
};

// ========== RELATÓRIO PDF ==========
async function generateReport(mainWindow) {

    if (!fs.existsSync(reportPath)) {
        try {
            fs.mkdirSync(reportPath);
        } catch (erroCriacaoPasta) {
            mainWindow.webContents.send('log-message', `❌ Erro ao criar pasta BotTacker: ${erroCriacaoPasta.message}`);
            return;
        }
    }

    const doc = new PDFDocument({ size: 'A4' });
    const timestamp = `relatorio_${Date.now()}.pdf`;
    const caminhoCompleto = path.join(reportPath, timestamp);
    doc.pipe(fs.createWriteStream(caminhoCompleto));
    // Configurar encoding
    doc.font('Helvetica');

    // Header
    doc.fontSize(20)
        .text('Relatório de Envio', { align: 'center' })
        .moveDown(2);

    // Detalhes da execução
    doc.fontSize(12)
        .text(`Data/Hora Início: ${formatDate(state.startTime)}`)
        .text(`Data/Hora Fim: ${formatDate(state.endTime)}`)
        .text(`Duração: ${calculateDuration(state.startTime, state.endTime)}`)
        .text(`Total de mensagens: ${state.successCount + state.errorCount}`)
        .text(`Sucessos: ${state.successCount}`)
        .text(`Erros: ${state.errorCount}`)
        .moveDown(2);

    // Seção de erros
    if (state.errors.length > 0) {
        doc.fontSize(14)
            .text('Erros ocorridos:', { underline: true })
            .moveDown(1);

        state.errors.forEach((err, index) => {
            doc.text(`${index + 1}. Linha ${err.linha}: ${err.nome} - ${err.telefone}`)
                .text(`   Erro: ${err.error}`)
                .moveDown(0.5);
        });
    }
    doc.end();
}