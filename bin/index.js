#!/usr/bin/env node

const shell = require('shelljs')
const fs = require('fs')
const dir = process.env.DIR || __dirname
const debug = process.env.DEV

if (!shell.which('pdfunite')) {
  shell.echo('Sorry, this script requires pdfunite')
  shell.exit(1)
}
if (!shell.which('pdfnup')) {
  shell.echo('Sorry, this script requires pdfnup')
  shell.echo('Please install pdfjam.')
  shell.exit(1)
}
if (!shell.which('ps2pdf')) {
  shell.echo('Sorry, this script requires ps2pdf')
  shell.exit(1)
}

const sortByNum = (a, b) => {
  const numA = parseInt(a.split('p')[1])
  const numB = parseInt(b.split('p')[1])
  return numA - numB
}

const execAsync = async command =>
  new Promise((resolve, reject) => {
    shell.exec(command, { silent: debug }, code => {
      console.log('Exited!', code)
      resolve()
    })
  })

const directory = dir + '/*.pdf'
// Get all pdf in folder and order by name
const pdfList = shell
  .ls(directory)
  .map(file => {
    const split = file.split('/')
    const pdfName = split[split.length - 1]
    if (pdfName) return pdfName
    else return file
  })
  .sort(sortByNum)
// Foreach pair join them:
let pair = []
let run = 0
const cover = 0
const counterCover = pdfList.length - 1
const outputDir = __dirname + '/output'
const webDir = outputDir + '/web'
const printDir = outputDir + '/print'
shell.rm('-rf', __dirname + '/output')
shell.mkdir('-p', webDir)
shell.mkdir('-p', printDir)
async function mergePdfs () {
  // Online
  for await (const pdf of pdfList) {
    const num = parseInt(pdf.split('.pdf')[0].split('p')[1])
    if (num === cover || num === counterCover) {
      // Online cover
      shell.cp(dir + '/' + pdf, webDir + '/' + 'p' + num + '.pdf')
    } else if (pair.length < 2) {
      pair.push(pdf)
    } else {
      run = run + 1
      // Online
      const command = `pdfnup --a3paper --nup 2x1 -o ${webDir}/p${run}.pdf ${dir +
        '/' +
        pair[0]} ${dir + '/' + pair[1]}`
      await execAsync(command)
      pair = []
      pair.push(pdf)
    }
  }
  console.log('DONE ONLINE MERGING')
  // Print
  for (let index = 0; index < pdfList.length / 2; index++) {
    const command = `pdfnup --a3paper --nup 2x1 -o ${printDir}/p${index}.pdf ${dir +
      '/' +
      pdfList[index]} ${dir + '/' + pdfList[pdfList.length - 1 - index]}`
    await execAsync(command)
  }
  console.log('DONE PRINT MERGING')
}
// Get list of new A3s and unite them:
async function pdfUnite (list, type) {
  const unitedList = list.map(i => outputDir + '/' + type + '/' + i).join(' ')
  const outputFile = `${outputDir}/${type}_raw.pdf`
  const command = `pdfunite ${unitedList} ${outputFile}`
  await execAsync(command)
  return outputFile
}

async function compressPdf (settings, file) {
  const newName = file.split('_raw')[0] + '.pdf'
  const command = `ps2pdf -dPDFSETTINGS=/${settings} ${file} ${newName}`
  await execAsync(command)
}

async function start () {
  await mergePdfs()
  const webPdfs = fs.readdirSync(webDir).sort(sortByNum)
  const printPdfs = fs.readdirSync(printDir).sort(sortByNum)
  const webRaw = await pdfUnite(webPdfs, 'web')
  const printRaw = await pdfUnite(printPdfs, 'print')
  compressPdf('printer', printRaw)
  compressPdf('ebook', webRaw)
}

start()
