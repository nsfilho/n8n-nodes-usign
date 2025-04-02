import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import axios from 'axios';

export class USign implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'uSign Node',
		icon: 'file:usign-logo.svg',
		name: 'uSign',
		group: ['transform'],
		version: 1,
		description: 'Interage com a API do uSign',
		defaults: { name: 'uSign Node' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'uSignApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Listar', value: 'find' },
					{ name: 'Resgatar', value: 'get' },
					{ name: 'Apagar', value: 'delete' },
					{ name: 'Alterar', value: 'put' },
				],
				default: 'find',
				description: 'Selecione a operação a ser executada',
			},
			{
				displayName: 'Load All Records',
				name: 'loadAll',
				type: 'boolean',
				displayOptions: {
					show: { operation: ['find'] },
				},
				default: false,
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				description: 'Max number of results to return',
				default: 50,
				displayOptions: {
					show: { operation: ['find'] },
					hide: { loadAll: [true] },
				},
			},
			{
				displayName: 'All Subdomains',
				name: 'allSubdomains',
				type: 'boolean',
				displayOptions: {
					show: { operation: ['find'] },
				},
				default: false,
			},
			{
				displayName: 'Entity Name or ID',
				name: 'entity',
				// type: 'options',
				// typeOptions: { loadOptionsMethod: 'getEntidades' },
				type: 'string',
				default: '',
				description: 'Nome da entidade',
				required: true,
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				default: '',
				displayOptions: {
					show: { operation: ['get', 'delete', 'put'] },
				},
				description: 'ID do recurso',
			},
			{
				displayName: 'JSON Data',
				name: 'updateData',
				type: 'json',
				default: '',
				displayOptions: { show: { operation: ['put'] } },
				description: 'Novo JSON para atualização',
			},
		],
	};

	// methods = {
	// 	loadOptions: {
	// 		async getEntidades(this) {
	// 			const credentials = await this.getCredentials('uSignCredential');
	// 			const { usuario, senha, baseUrl } = credentials;
	//
	// 			try {
	// 				const authResponse = await axios.post(`${baseUrl}/usuario/login`, {
	// 					usuario,
	// 					senha,
	// 				});
	// 				const token = authResponse.data.token;
	//
	// 				const entidades: any[] = [];
	// 				for (let page = 1; ; page += 1) {
	// 					const response = await axios.get(
	// 						`${baseUrl}/entidade/?tree=true&noCache=true&perPage=100&page=${page}`,
	// 						{
	// 							headers: { Authorization: `Bearer ${token}` },
	// 						},
	// 					);
	// 					entidades.push(...response.data.data);
	// 					if (response.data.data.length < 100) break;
	// 				}
	// 				return entidades.map((entidade) => ({
	// 					name: entidade.nome,
	// 					value: entidade._id,
	// 				}));
	// 			} catch (error) {
	// 				throw new NodeOperationError(
	// 					this.getNode,
	// 					`Erro ao carregar entidades: ${error.message}`,
	// 				);
	// 			}
	// 		},
	// 	},
	// };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('uSignApi');
		const { username, password, urlBase } = credentials;
		const operation = this.getNodeParameter('operation', 0) as string;
		const entity = this.getNodeParameter('entity', 0) as string;
		const id = this.getNodeParameter('id', 0, '') as string;
		const updateData = this.getNodeParameter('updateData', 0, '') as string;
		const limit = this.getNodeParameter('limit', 0, 50) as number;
		const loadAll = this.getNodeParameter('loadAll', 0, false) as boolean;
		const allSubdomains = this.getNodeParameter('allSubdomains', 0, false) as boolean;

		this.logger.debug(
			`Debug Info: ${JSON.stringify({ username, password, urlBase, operation, entity, id, updateData })}`,
		);

		try {
			// Autenticação para obter o JWT
			const authResponse = await axios.post(`${urlBase}/usuario/login`, {
				usuario: username,
				senha: password,
			});
			const token = authResponse.data.token;
			this.logger.warn(`Token: ${token}`);

			// Configuração do cabeçalho com JWT
			const headers = { Authorization: `Bearer ${token}` };

			let apiResponse;
			switch (operation) {
				case 'find':
					const allRecords = [];
					for (let page = 1; (!loadAll && allRecords.length < limit) || loadAll; page += 1) {
						let perPage = !loadAll && limit < 100 ? limit : 100;
						perPage =
							!loadAll && allRecords.length + perPage > limit ? limit - allRecords.length : perPage;
						const url = `${urlBase}/${entity}/?noCache=true&tree=${allSubdomains ? 'true' : 'false'}&perPage=${perPage}&page=${page}`;
						this.logger.debug(`URL: ${url}`);
						const records = await axios.get(url, { headers });
						allRecords.push(...records.data.data);
						if (records.data.data.length < perPage) break;
					}
					returnData.push(...allRecords.map((record) => ({ json: record })));
					break;
				case 'get':
					apiResponse = await axios.get(`${urlBase}/${entity}/${id}`, {
						headers,
					});
					returnData.push({ json: apiResponse.data });
					break;
				case 'delete':
					apiResponse = await axios.delete(`${urlBase}/${entity}/${id}`, {
						headers,
					});
					returnData.push({ json: apiResponse.data });
					break;
				case 'put':
					apiResponse = await axios.put(`${urlBase}/${entity}/${id}`, JSON.parse(updateData), {
						headers,
					});
					returnData.push({ json: apiResponse.data });
					break;
				default:
					throw new NodeOperationError(this.getNode, 'Operação inválida');
			}
		} catch (error) {
			throw new NodeOperationError(this.getNode, `Erro na requisição: ${error.message}`);
		}

		return [returnData];
	}
}
