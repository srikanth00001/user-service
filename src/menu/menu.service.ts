// menu.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Menu } from './entities/menu.entity';
import { Repository } from 'typeorm';
import { ApiResponseDto } from 'src/common/dto/response.dto';
import { MenuResponseDto } from './dto/menu_response.dto';
import * as fs from 'fs';
import * as path from 'path';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>,
  ) {}

  async createMenu(payload: CreateMenuDto, icon?: Express.Multer.File): Promise<ApiResponseDto> {
    try {
      const isNameExists = await this.menuRepository.findOne({
        where: { name: payload.name },
      });

      if (isNameExists) {
        if (icon) this.deleteFile(icon.path);
        this.logger.error(`Menu name "${payload.name}" already exists.`);
        return new ApiResponseDto({
          success: false,
          message: `Menu name "${payload.name}" already exists.`,
        });
      }

      // Validate required fields
      if (!payload.name || !payload.path || !payload.type || payload.order_by == null) {
        if (icon) this.deleteFile(icon.path);
        this.logger.error('Missing required fields in payload', payload);
        return new ApiResponseDto({
          success: false,
          message: 'Missing required fields: name, path, type, and order_by are required.',
        });
      }

      // Validate icon if provided
      if (icon) {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
        if (!allowedTypes.includes(icon.mimetype)) {
          this.deleteFile(icon.path);
          this.logger.error(`Invalid file type: ${icon.mimetype}`);
          return new ApiResponseDto({
            success: false,
            message: 'Invalid file type. Only PNG, JPEG, and SVG are allowed.',
          });
        }

        if (icon.size > 5 * 1024 * 1024) {
          this.deleteFile(icon.path);
          this.logger.error(`File size exceeds 5MB: ${icon.size} bytes`);
          return new ApiResponseDto({
            success: false,
            message: 'File size exceeds 5MB limit.',
          });
        }
      }

      const newMenu = this.menuRepository.create(payload);

      if (icon) {
        newMenu.icon = `/uploads/menu/${icon.filename}`;
        this.logger.log(`Icon uploaded: ${newMenu.icon}`);
      } else {
        this.logger.warn('No icon file provided.');
      }

      await this.menuRepository.save(newMenu);
      this.logger.log(`Menu "${payload.name}" created successfully.`);

      return new ApiResponseDto({
        success: true,
        message: `Menu "${payload.name}" added successfully.`,
        data: MenuResponseDto.fromEntity(newMenu),
      });
    } catch (error) {
      if (icon) this.deleteFile(icon.path);
      this.logger.error(`createMenu::Error ${error.message}`, error.stack);
      return new ApiResponseDto({
        success: false,
        message: `Failed to create menu: ${error.message}`,
      });
    }
  }

  async updateMenu(id: string, updatePayload: UpdateMenuDto, icon?: Express.Multer.File): Promise<ApiResponseDto> {
    try {
      const menu = await this.menuRepository.findOneBy({ id });

      if (!menu) {
        if (icon) this.deleteFile(icon.path);
        return new ApiResponseDto({
          success: false,
          message: `Menu with ID: ${id} not found.`,
        });
      }

      // Delete previous icon if new one uploaded
      if (icon && menu.icon) {
        this.deleteFile(path.join(process.cwd(), menu.icon.replace(/^\//, '')));
      }

      const updatedFields: Partial<UpdateMenuDto> = { ...updatePayload };

      // Update icon path if a new file is uploaded
      if (icon) {
        updatedFields.icon = `/uploads/menu/${icon.filename}`;
      }

      await this.menuRepository.update(id, updatedFields);

      const updatedMenu = await this.menuRepository.findOneBy({ id });

      if (!updatedMenu) {
        if (icon) this.deleteFile(icon.path);
        return new ApiResponseDto({
          success: false,
          message: 'Menu not exists or failed to update',
        });
      }

      return new ApiResponseDto({
        success: true,
        message: 'Menu updated successfully',
        data: MenuResponseDto.fromEntity(updatedMenu),
      });
    } catch (error) {
      if (icon) this.deleteFile(icon.path);
      this.logger.error(`updateMenu::Error ${error}`);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async getMenu(id: string): Promise<ApiResponseDto> {
    try {
      const response = await this.menuRepository.findOneBy({ id });

      if (!response) {
        return new ApiResponseDto({
          success: false,
          message: "Menu doesn't exist",
        });
      }

      return new ApiResponseDto({
        success: true,
        message: 'Menu exists',
        data: MenuResponseDto.fromEntity(response),
      });
    } catch (error) {
      this.logger.error(`getMenu::Error ${error}`);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async getMenuList(): Promise<ApiResponseDto> {
    try {
      const menus = await this.menuRepository.find({
        order: { order_by: 'ASC' },
      });

      if (!menus || menus.length === 0) {
        return new ApiResponseDto({
          success: false,
          message: "No menus found.",
        });
      }

      return new ApiResponseDto({
        success: true,
        message: 'Menus fetched successfully',
        data: MenuResponseDto.fromEntities(menus),
      });
    } catch (error) {
      this.logger.error(`getMenuList::Error ${error}`);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async deleteMenu(id: string): Promise<ApiResponseDto> {
    try {
      const menu = await this.menuRepository.findOneBy({ id });

      if (!menu) {
        return new ApiResponseDto({
          success: false,
          message: `Menu with ID: ${id} not found.`,
        });
      }

      // Delete associated icon file
      if (menu.icon) {
        this.deleteFile(path.join(process.cwd(), menu.icon.replace(/^\//, '')));
      }

      await this.menuRepository.delete(id);

      return new ApiResponseDto({
        success: true,
        message: 'Menu deleted successfully',
      });
    } catch (error) {
      this.logger.error(`deleteMenu::Error ${error}`);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  private deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      this.logger.error(`deleteFile::Error ${error}`);
    }
  }
}