import * as base64js from 'base64-js';
import { NgxImageCompressService } from 'ngx-image-compress';
import { DOC_ORIENTATION } from 'ngx-image-compress';
import { LoggerService } from './logger.service';
import { Injectable, inject } from '@angular/core';
import { FileSystemServiceInterface } from 'client/app/interfaces/Shared/file-system-service-interface';

/**
 * Renderer-side image I/O. All disk access is delegated to the Electron
 * main process over IPC (see src-electron/main.js `fs:*` handlers and
 * src-electron/preload.js). The renderer never imports `fs` or `electron`
 * directly, which is what allows contextIsolation: true.
 */
@Injectable({
  providedIn: 'root'
})
export class FileSystemService implements FileSystemServiceInterface {
  private imageCompressService = inject(NgxImageCompressService);
  private loggerService = inject(LoggerService);


  public imagesParentDirectoryForApp = 'Jewellery-Store-Management-System';
  public customerImagesDirectoryName = 'customerImages';
  public customerImagesDir = '';
  public productImagesDirectoryName = 'productImages';
  public productImagesDir = '';
  public userImagesDir = '';
  public userImagesDirectoryName = 'userImages';

  private electronAPI: any = (window as any).electronAPI;
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.initDirectories();
  }

  private async initDirectories(): Promise<void> {
    try {
      const picturesDir: string = await this.electronAPI.fs.getPicturesDirectory();
      if (picturesDir) {
        const sep = '\\';
        this.customerImagesDir = `${picturesDir}${sep}${this.imagesParentDirectoryForApp}${sep}${this.customerImagesDirectoryName}`;
        this.productImagesDir  = `${picturesDir}${sep}${this.imagesParentDirectoryForApp}${sep}${this.productImagesDirectoryName}`;
        this.userImagesDir     = `${picturesDir}${sep}${this.imagesParentDirectoryForApp}${sep}${this.userImagesDirectoryName}`;
      }
    } catch (error) {
      this.loggerService.LogError(error, 'FileSystemService.initDirectories()');
    }
  }

  async deleteFileIfExists(dirPath: string, fileName: string) {
    try {
      const fullPath = `${dirPath}\\${fileName}`;
      await this.electronAPI.fs.deleteImage(fullPath);
    } catch (error) {
      this.loggerService.LogError(`Error to delete file: ${fileName} from path: ${dirPath}`);
      throw error;
    }
  }

  async compressAndSaveImage(savePath: string, imageFile: any, funcName: string) {
    return new Promise<void>((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = async (event: any) => {
        try {
          const result = await this.imageCompressService.compressFile(event.target.result, DOC_ORIENTATION.Default, 50, 60);
          // Ship the base64 payload (already produced by the compressor) to
          // the main process, which writes it to disk. This keeps `fs` out
          // of the renderer.
          const base64Payload = result.split(',')[1];
          await this.electronAPI.fs.writeImage(savePath, base64Payload);
          resolve();
        } catch (error) {
          this.loggerService.LogError(error, `FileSystemService.${funcName}()`);
          reject(error);
        }
      };
      fileReader.readAsDataURL(imageFile);
    });
  }

  async getCustomerImageInBase64(imageFileName: string): Promise<string> {
    if (!imageFileName) return '';
    try {
      await this.readyPromise;
      const base64String: string = await this.electronAPI.fs.readImageBase64(
        `${this.customerImagesDir}\\${imageFileName}`
      );
      if (!base64String) return '';
      return 'data:image/jpeg;base64,' + base64String;
    } catch (error) {
      throw error;
    }
  }

  async getProductImageInBase64(imageFileName: string): Promise<string> {
    if (!imageFileName) return '';
    try {
      await this.readyPromise;
      const base64String: string = await this.electronAPI.fs.readImageBase64(
        `${this.productImagesDir}\\${imageFileName}`
      );
      if (!base64String) return '';
      return 'data:image/jpeg;base64,' + base64String;
    } catch (error) {
      throw error;
    }
  }

  async imageFileToUint8Array(file: File): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        resolve(new Uint8Array(arrayBuffer));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async saveCustomerImage(imageFile: any, imageFileName: string): Promise<void> {
    await this.readyPromise;
    const saveToPath = this.customerImagesDir + '\\' + imageFileName;
    await this.electronAPI.fs.ensureDir(this.customerImagesDir);
    return this.compressAndSaveImage(saveToPath, imageFile, 'saveCustomerImage');
  }

  async saveProductImage(imageFile: any, imageFileName: string) {
    await this.readyPromise;
    const saveToPath = this.productImagesDir + '\\' + imageFileName;
    await this.electronAPI.fs.ensureDir(this.productImagesDir);
    return this.compressAndSaveImage(saveToPath, imageFile, 'saveProductImage');
  }

  async updateCustomerImage(oldFileName: string, newFileName: string, imageFile: any) {
    try {
      await this.deleteFileIfExists(this.customerImagesDir, oldFileName);
      await this.saveCustomerImage(imageFile, newFileName);
    } catch (error) {
      throw error;
    }
  }

  async updateProductImage(oldFileName: string, newFileName: string, imageFile: any) {
    try {
      await this.deleteFileIfExists(this.productImagesDir, oldFileName);
      await this.saveProductImage(imageFile, newFileName);
    } catch (error) {
      throw error;
    }
  }

  async deleteCustomerImage(fileName: string) {
    try {
      await this.deleteFileIfExists(this.customerImagesDir, fileName);
    } catch (error) {
      throw error;
    }
  }

  async deleteProductImage(fileName: string) {
    try {
      await this.deleteFileIfExists(this.productImagesDir, fileName);
    } catch (error) {
      throw error;
    }
  }

  async saveUserImage(imageFile: any, imageFileName: string) {
    await this.readyPromise;
    const saveToPath = this.userImagesDir + '\\' + imageFileName;
    await this.electronAPI.fs.ensureDir(this.userImagesDir);
    return this.compressAndSaveImage(saveToPath, imageFile, 'saveUserImage');
  }

  async updateUserImage(oldFileName: string, newFileName: string, imageFile: any) {
    try {
      await this.deleteFileIfExists(this.userImagesDir, oldFileName);
      await this.saveUserImage(imageFile, newFileName);
    } catch (error) {
      throw error;
    }
  }

  async deleteUserImage(fileName: string) {
    try {
      await this.deleteFileIfExists(this.userImagesDir, fileName);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Reads any image stored in the user-images directory (shop logo, user
   * avatar) back as a base64 data URL. Uses the IPC read path so it works
   * under contextIsolation + webSecurity (unlike a raw `file://` src, which
   * Chromium blocks when the app is served from http://localhost in dev).
   */
  async getUserImageInBase64(imageFileName: string): Promise<string> {
    if (!imageFileName) { return ''; }
    try {
      await this.readyPromise;
      const base64String: string = await this.electronAPI.fs.readImageBase64(
        `${this.userImagesDir}\\${imageFileName}`
      );
      if (!base64String) { return ''; }
      return 'data:image/jpeg;base64,' + base64String;
    } catch (error) {
      this.loggerService.LogError(error, 'FileSystemService.getUserImageInBase64()');
      return '';
    }
  }

  /**
   * Saves the shop logo into the user-images directory. Mirrors saveUserImage:
   * awaits directory init (so userImagesDir is populated) and ensures the dir
   * exists before writing.
   */
  async saveShopLogo(imageFile: any, imageFileName: string) {
    await this.readyPromise;
    const saveToPath = this.userImagesDir + '\\' + imageFileName;
    await this.electronAPI.fs.ensureDir(this.userImagesDir);
    return this.compressAndSaveImage(saveToPath, imageFile, 'saveShopLogo');
  }
}
