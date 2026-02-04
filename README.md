# 📡 Contact Tracer Tool

> ⚠️ **ATENÇÃO:** este projeto está em **fase de desenvolvimento ativo**.  
> Espere **bugs**, comportamentos inesperados e mudanças frequentes.

---

## 📌 Descrição

Esta extensão tem como objetivo **scrapear / coletar / extrair informações de contato** a partir de páginas web, incluindo:

- 📧 **Emails**
- ☎️ **Telefones**
- 🌐 **Redes sociais** (Instagram, LinkedIn, Facebook, etc.)

A coleta é feita tanto na **página atual** quanto em **subpáginas do mesmo domínio**, utilizando um **Deep Scan automático**.

Além disso, a extensão realiza uma busca no **WHOIS/RDAP** para tentar identificar o **email registrado no domínio**.

---

## ⚙️ Como funciona (visão geral)

1. O usuário acessa uma página web
2. Abre a extensão
3. A extensão:
   - Coleta emails e telefones **da página atual**
   - Em segundo plano:
     - Identifica links internos (mesmo domínio)
     - Entra nesses links
     - Coleta emails e telefones adicionais
   - Consulta o **WHOIS do domínio** para buscar emails de registro
4. Todos os resultados são consolidados e exibidos na interface

---

## 🔍 Deep Scan

O **Deep Scan** funciona da seguinte forma:

- Ele pega **todos os links presentes na página atual**
- Filtra apenas links do **mesmo domínio**
- Entra nessas páginas automaticamente
- Extrai emails e telefones de cada uma delas
- Executa tudo em segundo plano, sem travar a navegação

> ⚠️ O Deep Scan ainda está em evolução e pode falhar em alguns sites.

---

## 📊 Estados do sistema

Durante a execução, a extensão pode apresentar os seguintes estados:

| Estado   | Significado |
|--------|------------|
| **RUNNING** | Deep Scan em execução |
| **IDLE** | Parado (possível bug ou falha de fluxo) |
| **OK** | Todas as tarefas concluídas com sucesso |
| **ERROR** | Erro inesperado (bug) |

---

## 🧩 Como instalar a extensão no Google Chrome

> Este projeto **não está na Chrome Web Store**.  
> A instalação deve ser feita **manualmente em modo desenvolvedor**.

### 📥 Passo a passo


1. Faça o download do codigo fonte ou baixe o zip e extraia os arquivos.

2. Abra o **Google Chrome**  
   Acesse: `chrome://extensions`

3. Ative o **Modo do Desenvolvedor**  
   No canto superior direito, ative o botão **Modo do desenvolvedor**.

4. Clique em **"Carregar sem compactação"**  
   Selecione a **pasta do projeto** (a que você extraiu; nela deve conter o `manifest.json`).

A extensão será carregada e aparecerá:
- Na lista de extensões
- Na barra do navegador (se tiver `action`)

---

## 📎 Como usar

1. Acesse qualquer página web.
2. Abra a extensão.
3. A coleta começa automaticamente:
   - Emails e telefones da página atual
   - Deep Scan em links internos do domínio
4. Aguarde o status mudar para **OK**.
5. Analise os resultados exibidos.

---

## 🧪 Status do projeto

🚧 **Em desenvolvimento**

Funcionalidades ainda não implementadas porem planejadas:
- ❌ Verificação de CNPJ (ex: integração com CNPJA)
- ❌ Validação de emails ( via emailable ou api publica )
- ❌ Normalização avançada de telefones
- ❌ Exportação de dados (CSV / TXT / JSON) ( atualmente apenas copia formatada )
- ❌ Sistema de logs detalhado (para debug)
- ❌ Configurações avançadas de Deep Scan ( para ter maior variedade de uso )

---

## ⚠️ Avisos importantes

- Este projeto **não garante 100% de precisão**
- Alguns sites bloqueiam scraping
- O Deep Scan pode:
  - Demorar
  - Falhar
  - Encontrar dados duplicados

---

## 💡 Observação final

Se você encontrou um bug, comportamento estranho ou tem sugestões, lembre-se:  
**isso é esperado nesta fase do projeto 😉**, se possivel crie um issue com todos os detalhes do momento em que houve o erro.

Contribuições são bem-vindas.
