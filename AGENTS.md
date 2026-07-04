# Regras obrigatórias deste projeto

## Backup antes de editar (OBRIGATÓRIO)
Antes de modificar, criar ou deletar QUALQUER arquivo neste projeto, 
rode primeiro:

git add -A && git commit -m "backup automatico antes de edicoes"

Se não houver nada para commitar (working tree clean), pode prosseguir.
Esta regra vale para TODA sessão, sem exceção.

## Outras regras
- Nunca rode "git checkout", "git reset --hard" ou "npx vercel --prod" 
  sem autorização explícita do Anderson
- Sempre mostre o plano de alterações antes de aplicar
- Deploy somente após teste local aprovado
- Ao final de alterações aprovadas, sugira fazer git push

## Atenção especial (histórico deste projeto)
Este projeto já sofreu perda de trabalho quando um App.jsx desatualizado 
sobrescreveu melhorias feitas por outra ferramenta. Nunca aplique 
alterações baseadas em versões antigas de arquivos: sempre leia o 
conteúdo ATUAL do arquivo antes de editá-lo.
