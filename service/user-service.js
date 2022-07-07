const UserModel = require('../models/user-model')
const bcrypt = require('bcrypt')
const uuid = require('uuid')
const jwt = require('jsonwebtoken')
const mailService = require('./mail-service')
const tokenService = require('./token-service')
const UserDto = require('../dtos/user-dtos')
const apiError = require('../exceptions/api-errors')

class UserService{

    async registration(email, password){
        const candidate = await UserModel.findOne({email})
        if(candidate){
            throw apiError.BadRequest(`Пользователь с почтовым адресом ${email} уже существует`)
        }
        const hashPassword = await bcrypt.hash(password, 3)
        const activationLink = uuid.v4()

        const user = await UserModel.create({email, password: hashPassword, activationLink})
        await mailService.sendActivationMail(email, `${process.env.API_URL}/api/activate/${activationLink}`)

        const userDto = new UserDto(user); // id, email, isActivated
        const tokens = tokenService.generateTokens({...userDto})
        await tokenService.saveToken(userDto.id, tokens.refreshToken)

        return { ...tokens, user: userDto }
    }

    async login(email, password){
        const user = await UserModel.findOne({email})
        if(!user){
            throw apiError.BadRequest('Пользователь с данным email не найден')
        }
        const isPassEquals = await bcrypt.compare(password, user.password)
        if(!isPassEquals){
            throw apiError.BadRequest('Введен неверный пароль')
        }

        const userDto = new UserDto(user);
        const tokens = tokenService.generateTokens({...userDto})
        await tokenService.saveToken(userDto.id, tokens.refreshToken)
        return {...tokens, user: userDto}
    }

    async activate(activationLink) {
        const user = await UserModel.findOne({activationLink})
        if(!user){
            throw apiError.BadRequest('Некоректная ссылка активации')
        }
        user.isActivated = true;
        await user.save();

    }

    async logout(refreshToken){
        const token = await tokenService.removeToken(refreshToken)
        return token
    }

    async refresh(refreshToken){
        if(!refreshToken){
            throw apiError.UnauthorizedError()
        }
        const userData = tokenService.validateRefreshToken(refreshToken)
        const tokenFromDB = await tokenService.findToken(refreshToken)
        if( !userData || !tokenFromDB){
            console.log('Здесь был')
            throw apiError.UnauthorizedError()
        }

        const user = await UserModel.findById(userData.id)
        const userDto = new UserDto(user); // id, email, isActivated
        const tokens = tokenService.generateTokens({...userDto})

        await tokenService.saveToken(userDto.id, tokens.refreshToken)
        return { ...tokens, user: userDto }

    }

    async getAllUsers(){
        const users = await UserModel.find()
        return users
    }
}
module.exports = new UserService()