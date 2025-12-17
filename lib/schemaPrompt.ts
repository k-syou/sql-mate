export interface SchemaTable {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable?: boolean;
  }>;
  primaryKey?: string[];
  foreignKeys?: Array<{
    column: string;
    references: {
      table: string;
      column: string;
    };
  }>;
}

export interface SchemaData {
  tables: SchemaTable[];
}

export function generateSchemaPrompt(schema: SchemaData): string {
  const parts: string[] = [];
  
  parts.push('다음은 데이터베이스 스키마입니다:\n\n');
  
  for (const table of schema.tables) {
    parts.push(`테이블: ${table.name}`);
    
    if (table.primaryKey && table.primaryKey.length > 0) {
      parts.push(`  PRIMARY KEY: ${table.primaryKey.join(', ')}`);
    }
    
    parts.push('  컬럼:');
    for (const col of table.columns) {
      const nullable = col.nullable !== false ? 'NULL' : 'NOT NULL';
      parts.push(`    - ${col.name} (${col.type}, ${nullable})`);
    }
    
    if (table.foreignKeys && table.foreignKeys.length > 0) {
      parts.push('  외래키:');
      for (const fk of table.foreignKeys) {
        parts.push(`    - ${fk.column} -> ${fk.references.table}.${fk.references.column}`);
      }
    }
    
    parts.push('');
  }
  
  parts.push('\n규칙:');
  parts.push('- SELECT 문만 생성하세요.');
  parts.push('- INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE는 사용하지 마세요.');
  parts.push('- LIMIT가 없으면 자동으로 LIMIT 200이 추가됩니다.');
  parts.push('- 위 스키마에 있는 테이블과 컬럼만 사용하세요.');
  parts.push('- SQL은 정확하고 실행 가능해야 합니다.');
  
  return parts.join('\n');
}

