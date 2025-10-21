import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { Connection, createConnection } from 'typeorm';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { User } from './entities/user.entity';
import { Role } from '../role/entities/role.entity';

@Injectable()
export class DatabaseManagementService implements TypeOrmOptionsFactory {
  private connections: Map<string, Connection> = new Map();
  private dbCounter: Map<string, number> = new Map(); // Track counters per domain

  async createTypeOrmOptions(): Promise<TypeOrmModuleOptions> {
    return {
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'Srikanth@03',
      database: 'digiwebspot',
      entities: [User, Role],
      synchronize: true,
      logging: true,
    };
  }

 async getPersonalDatabase(): Promise<string> {
  const defaultDb = 'digiwebspot';
  let currentDb = defaultDb;
  let counterKey = 'personal';
  let currentCounter = this.dbCounter.get(counterKey) || 0;

  // Check user count in the most recent database
  if (currentCounter > 0) {
    currentDb = `digiwebspot_${currentCounter}`;
    const userCount = await this.getUserCount(currentDb);
    if (userCount < 5) {
      console.log(`Using existing personal database ${currentDb} with ${userCount} users`);
      return currentDb;
    }
  }

  // Check user count in the default database if no suffix databases exist or the latest is full
  const userCount = await this.getUserCount(defaultDb);
  if (userCount < 5) {
    console.log(`Using default personal database ${defaultDb} with ${userCount} users`);
    return defaultDb;
  }

  // Create a new database since the current one is full
  const newDbName = `digiwebspot_${currentCounter + 1}`;
  try {
    await this.createDatabase(newDbName);
    this.dbCounter.set(counterKey, currentCounter + 1);
    console.log(`Created new personal database ${newDbName}`);
    return newDbName;
  } catch (error) {
    console.error(`Failed to create personal database ${newDbName}:`, error.message);
    throw new InternalServerErrorException(`Failed to create personal database ${newDbName}: ${error.message}`);
  }
}

  async getBusinessDatabase(email: string, domain: string): Promise<string> {
  const sanitizedDomain = domain.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const counterKey = `business_${sanitizedDomain}`;
  let currentDbName = `business_${sanitizedDomain}`;
  let currentCounter = this.dbCounter.get(counterKey) || 0;

  // Check if the most recent database exists and has space
  if (currentCounter > 0) {
    currentDbName = `business_${sanitizedDomain}_${currentCounter}`;
    const userCount = await this.getUserCount(currentDbName);
    if (userCount < 5) {
      console.log(`Using existing business database ${currentDbName} with ${userCount} users for domain ${domain}`);
      return currentDbName;
    }
  }

  // Check if the base database exists and has space
  let databaseExists = false;
  let tempConnection: Connection | null = null;
  try {
    tempConnection = await createConnection({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'Srikanth@03',
      database: 'postgres',
    });

    const checkDbQuery = await tempConnection.query(`
      SELECT 1 FROM pg_database WHERE datname = $1
    `, [currentDbName]);

    databaseExists = checkDbQuery.length > 0;
    console.log(`Database ${currentDbName} exists: ${databaseExists}`);
  } catch (error) {
    console.error(`Error checking existence of database ${currentDbName}:`, error.message);
    throw new InternalServerErrorException(`Failed to check database existence for ${currentDbName}: ${error.message}`);
  } finally {
    if (tempConnection) {
      await tempConnection.close().catch(err => console.error(`Error closing temp connection: ${err.message}`));
    }
  }

  // Create the base database if it doesn't exist
  if (!databaseExists) {
    try {
      await this.createDatabase(currentDbName);
      console.log(`Created new business database ${currentDbName} for domain ${domain}`);
    } catch (error) {
      console.error(`Error creating business database ${currentDbName} for domain ${domain}:`, error.message);
      throw new InternalServerErrorException(`Failed to create business database ${currentDbName}: ${error.message}`);
    }
  }

  // Check user count in the current database
  const userCount = await this.getUserCount(currentDbName);
  if (userCount < 5) {
    console.log(`Using business database ${currentDbName} with ${userCount} users for domain ${domain}`);
    return currentDbName;
  }

  // Create a new database with incremented suffix
  const newDbName = `business_${sanitizedDomain}_${currentCounter + 1}`;
  try {
    await this.createDatabase(newDbName);
    this.dbCounter.set(counterKey, currentCounter + 1);
    console.log(`Created new business database ${newDbName} for domain ${domain}`);
    return newDbName;
  } catch (error) {
    console.error(`Error creating business database ${newDbName} for domain ${domain}:`, error.message);
    throw new InternalServerErrorException(`Failed to create business database ${newDbName}: ${error.message}`);
  }
}

  async createDatabase(dbName: string): Promise<void> {
    let tempConnection: Connection | null = null;
    let newConnection: Connection | null = null;
    try {
      console.log(`Attempting to create database ${dbName}`);
      tempConnection = await createConnection({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'Srikanth@03',
        database: 'postgres',
      });

      // Sanitize database name to prevent SQL injection
      if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
        throw new BadRequestException(`Invalid database name: ${dbName}`);
      }

      const checkDbQuery = await tempConnection.query(`
        SELECT 1 FROM pg_database WHERE datname = $1
      `, [dbName]);

      if (checkDbQuery.length === 0) {
        await tempConnection.query(`CREATE DATABASE "${dbName}"`);
        console.log(`Database ${dbName} created successfully`);
      } else {
        console.log(`Database ${dbName} already exists`);
      }

      newConnection = await createConnection({
        name: dbName,
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'Srikanth@03',
        database: dbName,
        entities: [User, Role],
        synchronize: true,
        logging: true,
      });

      const roleRepository = newConnection.getRepository(Role);
      const defaultRoles = [
        { id: '810a2eec-751f-4ec1-a42b-e1a1d00684ce', name: 'personal' },
        { id: '2bc8ab7d-2387-4c32-8452-bfd78b71991d', name: 'business' },
      ];

      for (const role of defaultRoles) {
        const existingRole = await roleRepository.findOne({ where: { id: role.id } });
        if (!existingRole) {
          await roleRepository.save(role);
          console.log(`Inserted role ${role.name} with ID ${role.id} into ${dbName}`);
        } else {
          console.log(`Role ${role.name} with ID ${role.id} already exists in ${dbName}`);
        }
      }

      this.connections.set(dbName, newConnection);
    } catch (error) {
      console.error(`Error creating database ${dbName}:`, error.message, error.stack);
      throw new InternalServerErrorException(`Failed to create database ${dbName}: ${error.message}`);
    } finally {
      if (tempConnection) {
        await tempConnection.close().catch(err => console.error(`Error closing temp connection: ${err.message}`));
      }
    }
  }

  async getUserCount(dbName: string): Promise<number> {
    try {
      const connection = await this.getConnection(dbName);
      const userRepository = connection.getRepository(User);
      const count = await userRepository.count();
      console.log(`User count in ${dbName}: ${count}`);
      return count;
    } catch (error) {
      if (error.message.includes('database does not exist')) {
        console.log(`Database ${dbName} does not exist, returning 0`);
        return 0;
      }
      console.error(`Error getting user count for ${dbName}:`, error.message);
      throw error;
    }
  }

  async getConnection(dbName: string): Promise<Connection> {
    let connection = this.connections.get(dbName);
    if (!connection || !connection.isConnected) {
      try {
        connection = await createConnection({
          name: dbName,
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'Srikanth@03',
          database: dbName,
          entities: [User, Role],
          synchronize: true,
          logging: true,
        });
        this.connections.set(dbName, connection);
        console.log(`Connection established for ${dbName}`);
      } catch (error) {
        console.error(`Error establishing connection for ${dbName}:`, error.message);
        throw error;
      }
    }
    return connection;
  }

  async setDatabaseConnection(dbName: string): Promise<void> {
    try {
      const connection = await this.getConnection(dbName);
      await this.sendConnectionUpdateToMicroservice(dbName);
      console.log(`Database connection set to ${dbName}`);
    } catch (error) {
      console.error(`Error setting database connection to ${dbName}:`, error.message);
      throw new InternalServerErrorException(`Failed to set database connection to ${dbName}: ${error.message}`);
    }
  }

  async getAllDatabases(): Promise<string[]> {
  let tempConnection: Connection | null = null;
  try {
    tempConnection = await createConnection({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'Srikanth@03',
      database: 'postgres',
    });

    const query = `
      SELECT datname 
      FROM pg_database 
      WHERE datname LIKE 'digiwebspot%' OR datname LIKE 'business_%'
    `;
    const result = await tempConnection.query(query);
    const databases = result.map((row: any) => row.datname);
    console.log(`Found databases: ${databases}`);
    return databases;
  } catch (error) {
    console.error('Error fetching databases:', error.message);
    throw new InternalServerErrorException(`Failed to fetch databases: ${error.message}`);
  } finally {
    if (tempConnection) {
      await tempConnection.close().catch(err => console.error(`Error closing temp connection: ${err.message}`));
    }
  }
}
  

  private async sendConnectionUpdateToMicroservice(dbName: string) {
    const client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port: 3005,
      },
    });

    try {
      await client.send({ cmd: 'updateDatabaseConnection' }, { database: dbName }).toPromise();
      console.log(`Sent connection update for ${dbName} to microservice`);
    } catch (error) {
      console.error(`Error sending connection update for ${dbName}:`, error.message);
      throw new InternalServerErrorException(`Failed to send connection update for ${dbName}: ${error.message}`);
    }
  }
}