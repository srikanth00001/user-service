import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { Constants } from 'src/common/constants';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ApiResponseDto } from 'src/common/dto/response.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { ParseUUIDPipe } from '@nestjs/common';

// Configure storage for file uploads
const storage = diskStorage({
  destination: './uploads/menu',
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

@ApiTags('Menus')
@Controller({ path: 'menu', version: Constants.API_VERSION })
export class MenuController {
  constructor(private readonly menuService: MenuService) { }

  @ApiOperation({ summary: 'Create a new menu' })
  @ApiResponse({
    status: 201,
    description: 'Menu has been successfully created',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('create')
  @UseInterceptors(FileInterceptor('icon', { storage }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Dashboard' },
        order_by: { type: 'number', example: 1 },
        type: { type: 'string', example: 'item' },
        icon: { type: 'string', format: 'binary', description: 'Icon file for the menu item' },
        path: { type: 'string', example: '/dashboard' },
        params: { type: 'object', example: { id: 1 } },
        parent_id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
      },
      required: ['name', 'order_by', 'type', 'path'],
    },
  })
  async createMenu(@Body() menuPayload: CreateMenuDto, @UploadedFile() icon?: Express.Multer.File) {
    return await this.menuService.createMenu(menuPayload, icon);
  }

  @ApiOperation({ summary: 'Get all menus' })
  @ApiResponse({
    status: 200,
    description: 'Returns all menus',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('list')
  async findAllMenus() {
    return await this.menuService.getMenuList();
  }

  @ApiOperation({ summary: 'Get a menu by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns the menu information',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('read/:id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return await this.menuService.getMenu(id);
  }

  @ApiOperation({ summary: 'Update a menu' })
  @ApiResponse({
    status: 200,
    description: 'Menu has been successfully updated',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Put('update/:id')
  @UseInterceptors(FileInterceptor('icon', { storage }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Dashboard' },
        order_by: { type: 'number', example: 1 },
        type: { type: 'string', example: 'item' },
        icon: { type: 'string', format: 'binary', description: 'Icon file for the menu item' },
        path: { type: 'string', example: '/dashboard' },
        params: { type: 'object', example: { id: 1 } },
        parent_id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
      },
    },
  })
  async updateMenu(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePayload: UpdateMenuDto,
    @UploadedFile() icon?: Express.Multer.File,
  ) {
    return await this.menuService.updateMenu(id, updatePayload, icon);
  }

  @ApiOperation({ summary: 'Delete a menu' })
  @ApiResponse({
    status: 200,
    description: 'Menu has been successfully deleted',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Delete('delete/:id')
  async deleteMenu(@Param('id', ParseUUIDPipe) id: string) {
    return await this.menuService.deleteMenu(id);
  }
}