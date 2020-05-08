#!/usr/bin/env node

const shell = require('shelljs')
const fs = require('fs')
const dir = process.argv[2] || process.env.DIR || process.cwd()
const debug = process.env.DEV
const Spinner = require('cli-spinner').Spinner
const spinner = new Spinner('processing.. %s')
spinner.setSpinnerString('|/-\\')

if (debug) {
  console.log(dir)
}

if (!shell.which('inkscape')) {
  shell.echo('Sorry, this script requires inkscape')
  shell.exit(1)
}
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

const outputDir = dir + '/output'
const webDir = outputDir + '/web'
const printDir = outputDir + '/print'
const pdfDir = outputDir + '/pdf'
shell.rm('-rf', dir + '/output')
shell.mkdir('-p', pdfDir)
shell.mkdir('-p', webDir)
shell.mkdir('-p', printDir)

const sortByNum = (a, b) => {
  const numA = parseInt(a.split('p')[1])
  const numB = parseInt(b.split('p')[1])
  return numA - numB
}

const execAsync = async command =>
  new Promise((resolve, reject) => {
    shell.exec(command, { silent: debug || true }, code => {
      if (debug) {
        console.log('Exited!', code)
      }
      resolve()
    })
  })

const svgDirectory = dir + '/*.svg'
const svgList = shell
  .ls(svgDirectory)
  .map(file => {
    const split = file.split('/')
    const pdfName = split[split.length - 1]
    if (pdfName) return pdfName
    else return file
  })
  .sort(sortByNum)
async function exportPdfs () {
  for await (const svg of svgList) {
    const pdfName = svg.split('.svg')[0] + '.pdf'
    const command = `inkscape --file=${dir}/${svg} --export-pdf=${pdfDir}/${pdfName}`
    await execAsync(command)
  }
}

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

async function mergeForWeb (pdfList) {
  const cover = 0
  const counterCover = pdfList.length - 1
  shell.cp(pdfDir + '/' + pdfList[cover], webDir + '/' + 'p' + cover + '.pdf')
  shell.cp(
    pdfDir + '/' + pdfList[counterCover],
    webDir + '/' + 'p' + counterCover + '.pdf'
  )
  for (let index = 1; index < pdfList.length; index += 2) {
    if (index !== counterCover) {
      const command = `pdfnup --a3paper --nup 2x1 -o ${webDir}/p${index}.pdf ${pdfDir +
        '/' +
        pdfList[index]} ${pdfDir + '/' + pdfList[index + 1]}`
      await execAsync(command)
    }
  }
  if (debug) console.log('DONE ONLINE MERGING')
}

async function mergeForPrint (pdfList) {
  for (let index = 0; index < pdfList.length / 2; index++) {
    const command = `pdfnup --a3paper --nup 2x1 -o ${printDir}/p${index}.pdf ${pdfDir +
      '/' +
      pdfList[index]} ${pdfDir + '/' + pdfList[pdfList.length - 1 - index]}`
    await execAsync(command)
  }
  if (debug) console.log('DONE PRINT MERGING')
}

async function start () {
  spinner.start()
  await exportPdfs()
  const pdfs = await fs.readdirSync(pdfDir).sort(sortByNum)
  await mergeForWeb(pdfs)
  await mergeForPrint(pdfs)
  const webPdfs = fs.readdirSync(webDir).sort(sortByNum)
  const printPdfs = fs.readdirSync(printDir).sort(sortByNum)
  const webRaw = await pdfUnite(webPdfs, 'web')
  const printRaw = await pdfUnite(printPdfs, 'print')
  compressPdf('printer', printRaw)
  compressPdf('ebook', webRaw)
  spinner.stop()
  console.log('Done, check', outputDir)
}

start()
