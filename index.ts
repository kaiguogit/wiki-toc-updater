import yargs, { ArgumentsCamelCase, Argv } from 'yargs';

import { basename, extname, resolve, join } from 'path';
import { Stats } from 'fs';
import { stat, writeFile, readFile, readdir } from 'fs/promises';
import { toSpaceSeparated } from './utils/to-space-separated';
const EXCLUDED_FOLDERS = ['uploads'];
interface Options {
  directory: string;
}
class DocFolder {
  files: Map<string, DocFile>;
  folders: Map<string, DocFolder>;
  name: string;
  displayName: string;

  constructor({
    name,
    files,
    folders
  }: {
    name: string;
    files: Map<string, DocFile>;
    folders: Map<string, DocFolder>;
  }) {
    this.name = name;
    this.displayName = toSpaceSeparated(name);
    this.files = files;
    this.folders = folders;
  }
}

class DocFile {
  fileName: string;
  baseName: string;
  link: string;
  displayName: string;
  constructor({ fileName, link }: { fileName: string; link: string }) {
    this.baseName = basename(fileName);
    this.fileName = fileName;
    this.link = link;
    this.displayName = toSpaceSeparated(fileName);
  }
}
const findDocFiles = async (
  dir: string,
  level: number = 0
): Promise<{ files: Map<string, DocFile>; folders: Map<string, DocFolder> }> => {
  const docFiles: Map<string, DocFile> = new Map();
  const fileAndFolders = await readdir(dir);
  const docFolders: Map<string, DocFolder> = new Map();

  for (const name of fileAndFolders) {
    try {
      const fileStat = await stat(join(dir, name));
      if (fileStat.isFile()) {
        docFiles.set(
          name,
          new DocFile({
            fileName: name,
            link: `${dir}/${name}`
          })
        );
      } else if (fileStat.isDirectory()) {
        if (EXCLUDED_FOLDERS.includes(name) && level === 0) {
          continue;
        }
        const { files, folders } = await findDocFiles(join(dir, name), level + 1);
        docFolders.set(name, new DocFolder({ name, files, folders }));
      }
    } catch (e) {}
  }
  return { files: docFiles, folders: docFolders };
};
const updateHomeFiles = async (
  homeFile: string,
  files: DocFile[],
  folders: DocFolder[]
): Promise<void> => {
  if (await stat(homeFile)) {
    const content = (await readFile(homeFile)).toString();
    const lines = content.split('\n');
    lines.splice(1, 0, args.data);
    await writeFile(filePath, lines.join('\n'));
  }
};

const exec = async (args: ArgumentsCamelCase<Options>): Promise<void> => {
  try {
    const dirStat = await stat(args.directory);
    if (!dirStat.isDirectory()) {
      throw new Error(`Failed to find directory ${args.directory}`);
    }
  } catch (e) {
    throw new Error(`Failed to find directory ${args.directory}`);
  }
  const homeFilePath = join(args.directory, 'Home.md');
  try {
    const homeFileStat = await stat(homeFilePath);
    if (!homeFileStat.isFile()) {
      throw new Error(`Failed to find Home.md`);
    }
  } catch (e) {
    throw new Error(`Failed to find Home.md`);
  }

  const { files, folders } = await findDocFiles(args.directory);
  updateHomeFiles(homeFilePath, new DocFolder({name:'home', files, folders});
};
const parseArgsAndRun = ():
  | {
      [x: string]: unknown;
      _: Array<string | number>;
      $0: string;
    }
  | Promise<{
      [x: string]: unknown;
      _: Array<string | number>;
      $0: string;
    }> => {
  return yargs
    .env('write lines')
    .command(
      'write',
      `A tool to update wiki repo table of contents.`,
      (yargs: Argv<any>) => {
        return yargs
          .options({
            l: {
              describe: 'The workspace directory',
              alias: 'directory',
              type: 'string'
            }
          })
          .demandOption(['d', 'f', 'l']);
      },
      exec
    )
    .usage('Write data to a file')
    .demandCommand(1)
    .showHelpOnFail(true)
    .parse();
};

if (require.main === module) {
  parseArgsAndRun();
}
