import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
   import { InjectRepository } from '@nestjs/typeorm';
   import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';

   @Injectable()
   export class RoleService {
     constructor(
       @InjectRepository(Role)
       private roleRepository: Repository<Role>,
     ) {}

     async createRole(roleData: { name: string }) {
       const existingRole = await this.roleRepository.findOne({ where: { name: roleData.name } });
       if (existingRole) {
         throw new ConflictException('Role already exists');
       }
       const role = this.roleRepository.create(roleData);
       return this.roleRepository.save(role);
     }

     async getRoles() {
       return this.roleRepository.find();
     }

     async getRole(id: string) {
       const role = await this.roleRepository.findOne({ where: { id } });
       if (!role) {
         throw new BadRequestException('Role not found');
       }
       return role;
     }

     async updateRole(id: string, roleData: { name: string }) {
       const role = await this.getRole(id);
       await this.roleRepository.update(id, roleData);
       return this.getRole(id);
     }

     async deleteRole(id: string) {
       const role = await this.getRole(id);
       await this.roleRepository.delete(id);
       return { message: 'Role deleted successfully' };
     }
   }