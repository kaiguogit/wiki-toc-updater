import yargs, { ArgumentsCamelCase, Argv } from 'yargs';

import { readdir, stat, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { toSpaceSeparated } from './utils/to-space-separated';
const EXCLUDED_FOLDERS = ['uploads', 'wiki-tool'];
const EXCLUDED_FILES = ['Home.md'];
interface Options {
  directory: string;
}
const removeMdExt = (fileName: string): string => {
  return fileName.replace(/\.md$/, '');
};

class DocFolder {
  docFiles: Map<string, DocFile>;
  // Each home file is coresponding to a folder
  homeFiles: Map<string, DocFile>;
  folders: Map<string, DocFolder>;
  name: string;
  path: string;
  displayName: string;
  link: string;

  constructor({
    name,
    displayName,
    path,
    files,
    link,
    folders
  }: {
    name: string;
    displayName: string;
    path: string;
    link: string;
    files: Map<string, DocFile>;
    folders: Map<string, DocFolder>;
  }) {
    this.name = name;
    this.path = path;
    this.link = link;
    this.displayName = displayName;
    this.folders = folders;
    const homeFiles: Map<string, DocFile> = new Map();
    for (const folderName of folders.keys()) {
      const homeFileName = `${folderName}.md`;
      const homeFile = files.get(homeFileName);
      if (homeFile) {
        homeFiles.set(folderName, homeFile);
        files.delete(homeFileName);
      }
    }
    this.docFiles = files;
    this.homeFiles = homeFiles;
  }

  getMarkDownLink() {
    return this.link && `\n# [${this.displayName}](${this.link})`;
  }
}

class DocFile {
  fileName: string;
  baseName: string;
  link: string;
  path: string;
  displayName: string;
  constructor({ fileName, link, path }: { fileName: string; path: string; link: string }) {
    this.baseName = removeMdExt(fileName);
    this.fileName = fileName;
    this.link = link;
    this.path = path;
    this.displayName = toSpaceSeparated(this.baseName);
  }
  getMarkDownLink() {
    return `\n[${this.displayName}](${this.link})`;
  }
}
/**
 * Recursively go through folder and instantiate files and folders.
 */
const findDocFiles = async ({
  dir,
  level = 0,
  relativeDirLink = '',
  dirDisplayName = ''
}: {
  dir: string;
  level?: number;
  relativeDirLink?: string;
  dirDisplayName?: string;
}): Promise<{ files: Map<string, DocFile>; folders: Map<string, DocFolder> }> => {
  const docFiles: Map<string, DocFile> = new Map();
  const fileAndFolders = await readdir(dir);
  const docFolders: Map<string, DocFolder> = new Map();

  for (const name of fileAndFolders) {
    try {
      const filePath = join(dir, name);
      const fileStat = await stat(filePath);
      const newRelativeDirLink =
        level === 0 ? name : `${relativeDirLink}/${encodeURIComponent(removeMdExt(name))}`;
      const displayName = toSpaceSeparated(name);
      const newDisplayName = level === 0 ? displayName : `${dirDisplayName} > ${displayName}`;

      if (fileStat.isFile() && name.endsWith('.md')) {
        if (EXCLUDED_FILES.includes(name)) {
          continue;
        }
        docFiles.set(
          name,
          new DocFile({
            fileName: name,
            path: filePath,
            link: newRelativeDirLink
          })
        );
      } else if (fileStat.isDirectory()) {
        if (EXCLUDED_FOLDERS.includes(name) && level === 0) {
          continue;
        }

        const { files, folders } = await findDocFiles({
          dir: join(dir, name),
          level: level + 1,
          relativeDirLink: newRelativeDirLink,
          dirDisplayName: newDisplayName
        });
        docFolders.set(
          name,
          new DocFolder({
            name,
            displayName: newDisplayName,
            link: newRelativeDirLink,
            path: filePath,
            files,
            folders
          })
        );
      }
    } catch (e) {
      console.error(e);
    }
  }
  return { files: docFiles, folders: docFolders };
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const sortFileOrFolder = <T extends DocFile | DocFolder>(iterator: IterableIterator<T>): T[] =>
  Array.from(iterator).sort((a, b) => collator.compare(a.displayName, b.displayName));

const traverse = async ({
  folder,
  folderCallback,
  fileCallback,
  homeFileCallback
}: {
  folder: DocFolder;
  folderCallback: (folder: DocFolder) => void;
  fileCallback: (file: DocFile) => void;
  homeFileCallback: (homeFile: string, folder: DocFolder) => Promise<void>;
}): Promise<void> => {
  folderCallback(folder);
  for (const file of sortFileOrFolder(folder.docFiles.values())) {
    fileCallback(file);
  }
  for (const subFolder of sortFileOrFolder(folder.folders.values())) {
    if (subFolder.docFiles.size) {
      await traverse({
        folder: subFolder,
        folderCallback,
        fileCallback,
        homeFileCallback
      });
    }
    const subFolderHomeFile = folder.homeFiles.get(subFolder.name);
    if (subFolderHomeFile) {
      await homeFileCallback(subFolderHomeFile.path, subFolder);
    }
  }
};

/**
 * Write home files with folder and file makr down links.
 */
const updateHomeFiles = async (homeFile: string, folder: DocFolder): Promise<void> => {
  if (await stat(homeFile)) {
    const lines: string[] = [];
    await traverse({
      folder,
      folderCallback: folder => {
        const link = folder.getMarkDownLink();
        if (link) {
          lines.push(link);
        }
      },
      fileCallback: file => lines.push(file.getMarkDownLink()),
      homeFileCallback: updateHomeFiles
    });
    await writeFile(homeFile, lines.join('\n'));
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

  const { files, folders } = await findDocFiles({ dir: args.directory });
  await updateHomeFiles(
    homeFilePath,
    new DocFolder({ name: 'home', displayName: '', link: '', path: args.directory, files, folders })
  );
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
      (yargs: Argv<unknown>) => {
        return yargs
          .options({
            l: {
              describe: 'The workspace directory',
              alias: 'directory',
              type: 'string'
            }
          })
          .demandOption(['l']);
      },
      exec
    )
    .usage('Write data to a file')
    .demandCommand(1)
    .showHelpOnFail(true)
    .parse();
};

if (require.main === module) {
  void parseArgsAndRun();
}
