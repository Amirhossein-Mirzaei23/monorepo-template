import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'jane@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 's3cure-pass' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
