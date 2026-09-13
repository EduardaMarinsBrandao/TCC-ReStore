# ♻️ RE-STORE — _Marketplace_ Sustentável

![CI](https://github.com/EduardaMarinsBrandao/TCC-ReStore/actions/workflows/ci.yml/badge.svg)
![CD](https://github.com/EduardaMarinsBrandao/TCC-ReStore/actions/workflows/cd.yml/badge.svg)

## 📌 Sobre o Projeto

O **RE-STORE** é uma plataforma de _marketplace_ sustentável desenvolvida com o objetivo de incentivar o **consumo consciente** e a **economia circular**, permitindo que usuários possam comprar e vender produtos usados de forma segura, prática e organizada.

O projeto busca solucionar problemas comuns encontrados em _marketplaces_ tradicionais, como a falta de confiança entre compradores e vendedores, dificuldade em avaliar o estado dos produtos e a ausência de incentivos para o reaproveitamento de objetos.

Por meio da plataforma, os usuários poderão cadastrar produtos, realizar buscas com filtros, acompanhar pedidos, conversar com vendedores e utilizar um sistema de pontuação sustentável baseado na reutilização de produtos.

---

# 👥 Integrantes

- Eduarda Marins Brandão  
- Cauã Alborghette Domingos  
- Eyke Bryan de Paula  
- Felipe Ferreira de Araújo Costa  
- Larissa Sirio Ferraz  
- Leonardo Rodrigues de Paula  

---

# 🎓 Informações Acadêmicas

**Curso:** Ensino Médio Integrado ao Desenvolvimento de Sistemas (MTEC-PI DS)  
**Turma:** 3º Mtec PI DS  
**Instituição:** ETEC Euro Albino de Souza  

**Professores Orientadores:** Pedro Ramires da Silva e Marcus Antônio Bretas

---

# 🚀 Funcionalidades do Projeto

O RE-STORE contará com funcionalidades como:

- Cadastro e login de usuários;
- Publicação e gerenciamento de produtos;
- Pesquisa com filtros personalizados;
- Carrinho de compras;
- Finalização de pedidos;
- Cadastro de endereço de entrega;
- Acompanhamento de pedidos;
- _Chat_ entre compradores e vendedores;
- Sistema de pontuação sustentável;
- Recompensas por práticas de consumo consciente;
- Interface com modo claro e escuro.

---

# 🛠️ Tecnologias Utilizadas

## Front-end
- HTML5
- CSS3
- JavaScript

## Back-end
- PHP

## Banco de Dados
- MySQL

## Ferramentas
- Visual Studio Code
- XAMPP
- HeidiSQL
- Git e GitHub
- Figma

---

# 📊 Status do Desenvolvimento

🟡 **Em desenvolvimento**

Atualmente o projeto encontra-se na etapa de desenvolvimento das funcionalidades principais, incluindo estruturação do banco de dados, implementação das telas, integração entre _front-end_ e _back-end_ e realização de testes.

---

# 🎨 Protótipo

O protótipo da interface do projeto está disponível no Figma:

🔗 https://www.figma.com/make/5dZxzX2iL54rRlmT1oXhqE/Re-Store2.0?t=F5ggTYGNSAiqD4V1-1&preview-route=%2Fhome

---

# 📚 Wiki do Projeto

A documentação completa do projeto pode ser encontrada na Wiki:

🔗 https://github.com/EduardaMarinsBrandao/TCC-ReStore/wiki

---

# ⚙️ CI/CD (Integração e Implantação Contínua)

O projeto conta com automação completa via **GitHub Actions**:

- **CI (`.github/workflows/ci.yml`)**:
  - Validação de sintaxe PHP (`php -l`) em matriz de versões (PHP 8.1, 8.2 e 8.3).
  - Execução automática da suíte de testes (`tests/test_suite.php`) verificando integridade do banco de dados (SQLite/MySQL) e respostas das APIs (`products`, `auth`, `points`).
  - Verificação de integridade dos arquivos e diretórios essenciais.
  - Disparado em todos os `push` e `pull request` para a branch `main`.

- **CD (`.github/workflows/cd.yml`)**:
  - Deploy automático via **FTPS/FTP** para a hospedagem de produção (InfinityFree / cPanel).
  - Disparado após alterações na branch `main` ou manualmente via `workflow_dispatch`.

### 🔐 Configuração das Secrets para Deploy Automático
Para ativar o envio automático para o servidor, configure as seguintes credenciais em:
**Configurações do Repositório (`Settings`) > `Secrets and variables` > `Actions` > `New repository secret`**:

| Nome do Segredo | Descrição | Exemplo |
|-----------------|-----------|---------|
| `FTP_SERVER` | Servidor FTP da hospedagem | `ftpupload.net` |
| `FTP_USERNAME` | Usuário da conta FTP | `if0_42831392` |
| `FTP_PASSWORD` | Senha da conta FTP | `SuaSenhaSegura` |

---

# 📄 Licença

Este projeto foi desenvolvido como Trabalho de Conclusão de Curso (TCC) para o curso de Ensino Médio Integrado ao Desenvolvimento de Sistemas da ETEC Euro Albino de Souza.
