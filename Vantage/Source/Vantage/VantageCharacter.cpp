#include "VantageCharacter.h"

#include "CodeLock.h"
#include "Revolver.h"
#include "RobotDog.h"
#include "VantageGameMode.h"
#include "ZombieCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "InputActionValue.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "TimerManager.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float MeshHalfSize = 50.f;

	const FLinearColor SkinColour    (0.600f, 0.410f, 0.290f);
	const FLinearColor CoatColour    (0.270f, 0.185f, 0.120f);
	const FLinearColor ShirtColour   (0.415f, 0.355f, 0.270f);
	const FLinearColor TrouserColour (0.190f, 0.170f, 0.160f);
	const FLinearColor BootColour    (0.120f, 0.095f, 0.080f);
	const FLinearColor HairColour    (0.155f, 0.100f, 0.065f);
	const FLinearColor HatColour     (0.185f, 0.135f, 0.090f);
	const FLinearColor BandColour    (0.095f, 0.070f, 0.050f);
	const FLinearColor LeatherColour (0.135f, 0.090f, 0.055f);

	/** Resting pitch of the gun arm. Nearly level, angled a touch down. */
	constexpr float GunShoulderRest = -80.f;
}

AVantageCharacter::AVantageCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(38.f, 92.f);

	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = true;
	bUseControllerRotationRoll = false;

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = false;
	Movement->MaxWalkSpeed = WalkSpeed;
	Movement->MaxWalkSpeedCrouched = 230.f;
	Movement->JumpZVelocity = 480.f;
	Movement->AirControl = 0.35f;
	Movement->BrakingDecelerationWalking = 2000.f;
	Movement->SetCrouchedHalfHeight(55.f);
	Movement->GetNavAgentPropertiesRef().bCanCrouch = true;
	// The stairs into the vault rise in 22cm treads; the default 45 clears them.
	Movement->MaxStepHeight = 45.f;

	SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
	SpringArm->SetupAttachment(GetCapsuleComponent());
	SpringArm->SetRelativeLocation(FVector(0.f, 0.f, 62.f));
	SpringArm->TargetArmLength = 285.f;
	SpringArm->bUsePawnControlRotation = true;
	SpringArm->SocketOffset = FVector(0.f, 68.f, 22.f);
	SpringArm->bDoCollisionTest = true;
	SpringArm->ProbeSize = 14.f;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(SpringArm, USpringArmComponent::SocketName);
	Camera->bUsePawnControlRotation = false;
	Camera->FieldOfView = BaseFieldOfView;

	BodyRoot = CreateDefaultSubobject<USceneComponent>(TEXT("BodyRoot"));
	BodyRoot->SetupAttachment(GetCapsuleComponent());

	AimPivot = CreateDefaultSubobject<USceneComponent>(TEXT("AimPivot"));
	AimPivot->SetupAttachment(BodyRoot);
	AimPivot->SetRelativeLocation(FVector(0.f, 0.f, 44.f));

	// --- torso and head, which never articulate -----------------------------
	Torso = AddBodyPart(TEXT("Torso"), BodyRoot, FVector(0.f, 0.f, 20.f), FVector(15.f, 22.f, 30.f), FRotator::ZeroRotator);
	Coat  = AddBodyPart(TEXT("Coat"),  BodyRoot, FVector(-2.f, 0.f, 6.f), FVector(17.f, 24.f, 24.f), FRotator::ZeroRotator);

	Head = AddBodyPart(TEXT("Head"), BodyRoot, FVector(2.f, 0.f, 62.f), FVector(12.f, 11.f, 13.f), FRotator::ZeroRotator);
	Hair = AddBodyPart(TEXT("Hair"), BodyRoot, FVector(-2.f, 0.f, 71.f), FVector(11.f, 11.5f, 4.f), FRotator::ZeroRotator);

	// Wide brimmed hat: brim, band, crown. The brim is what carries the
	// silhouette from a distance, so it is deliberately oversized.
	HatBrim  = AddBodyPart(TEXT("HatBrim"),  BodyRoot, FVector(2.f, 0.f, 77.f), FVector(21.f, 20.f, 2.f),  FRotator(-3.f, 0.f, 0.f));
	HatBand  = AddBodyPart(TEXT("HatBand"),  BodyRoot, FVector(2.f, 0.f, 81.f), FVector(12.5f, 11.5f, 2.5f), FRotator::ZeroRotator);
	HatCrown = AddBodyPart(TEXT("HatCrown"), BodyRoot, FVector(2.f, 0.f, 89.f), FVector(12.f, 11.f, 8.f),  FRotator::ZeroRotator);

	Beard      = AddBodyPart(TEXT("Beard"),      BodyRoot, FVector(10.f, 0.f, 54.f), FVector(7.f, 9.5f, 10.f),  FRotator::ZeroRotator);
	BeardTaper = AddBodyPart(TEXT("BeardTaper"), BodyRoot, FVector(12.f, 0.f, 42.f), FVector(4.5f, 5.5f, 5.5f), FRotator(7.f, 0.f, 0.f));
	Moustache  = AddBodyPart(TEXT("Moustache"),  BodyRoot, FVector(14.f, 0.f, 59.f), FVector(2.5f, 7.5f, 2.5f), FRotator::ZeroRotator);

	// Coat collar turned up, a belt at the waist, and tails hanging behind -
	// the three pieces that stop the coat reading as one plain box.
	Collar    = AddBodyPart(TEXT("Collar"),    BodyRoot, FVector(-2.f, 0.f, 46.f),     FVector(16.f, 24.f, 6.f),  FRotator::ZeroRotator);
	Belt      = AddBodyPart(TEXT("Belt"),      BodyRoot, FVector(-1.f, 0.f, -8.f),     FVector(18.f, 25.f, 4.f),  FRotator::ZeroRotator);
	LeftTail  = AddBodyPart(TEXT("LeftTail"),  BodyRoot, FVector(-15.f, -11.f, -22.f), FVector(5.f, 11.f, 24.f),  FRotator(4.f, 0.f, 0.f));
	RightTail = AddBodyPart(TEXT("RightTail"), BodyRoot, FVector(-15.f, 11.f, -22.f),  FVector(5.f, 11.f, 24.f),  FRotator(4.f, 0.f, 0.f));

	// --- legs: hip to knee to ankle -----------------------------------------
	// Hips sit at Z -10 and the feet land at -92, so thigh and shin split the
	// 82cm between them and the boot makes up the rest.
	LeftHip = AddJoint(TEXT("LeftHip"), BodyRoot, FVector(0.f, -13.f, -10.f));
	LeftThigh = AddBone(TEXT("LeftThigh"), LeftHip, FVector(10.f, 9.f, 20.f));
	LeftKnee = AddJoint(TEXT("LeftKnee"), LeftHip, FVector(0.f, 0.f, -40.f));
	LeftShin = AddBone(TEXT("LeftShin"), LeftKnee, FVector(8.5f, 8.f, 19.f));
	LeftFoot = AddBodyPart(TEXT("LeftFoot"), LeftKnee, FVector(6.f, 0.f, -38.f), FVector(13.f, 9.f, 4.f), FRotator::ZeroRotator);

	RightHip = AddJoint(TEXT("RightHip"), BodyRoot, FVector(0.f, 13.f, -10.f));
	RightThigh = AddBone(TEXT("RightThigh"), RightHip, FVector(10.f, 9.f, 20.f));
	RightKnee = AddJoint(TEXT("RightKnee"), RightHip, FVector(0.f, 0.f, -40.f));
	RightShin = AddBone(TEXT("RightShin"), RightKnee, FVector(8.5f, 8.f, 19.f));
	RightFoot = AddBodyPart(TEXT("RightFoot"), RightKnee, FVector(6.f, 0.f, -38.f), FVector(13.f, 9.f, 4.f), FRotator::ZeroRotator);

	// --- arms: shoulder to elbow to hand ------------------------------------
	// The gun shoulder starts pitched nearly flat so the arm reaches forward
	// rather than hanging; the free arm hangs and swings with the walk.
	GunShoulder = AddJoint(TEXT("GunShoulder"), AimPivot, FVector(4.f, 20.f, 2.f), FRotator(GunShoulderRest, 0.f, 0.f));
	GunUpperArm = AddBone(TEXT("GunUpperArm"), GunShoulder, FVector(7.5f, 7.5f, 13.f));
	GunElbow = AddJoint(TEXT("GunElbow"), GunShoulder, FVector(0.f, 0.f, -26.f));
	GunForearm = AddBone(TEXT("GunForearm"), GunElbow, FVector(6.5f, 6.5f, 12.f));

	GunHand = CreateDefaultSubobject<USceneComponent>(TEXT("GunHand"));
	GunHand->SetupAttachment(GunElbow);
	GunHand->SetRelativeLocation(FVector(0.f, 0.f, -24.f));

	FreeShoulder = AddJoint(TEXT("FreeShoulder"), BodyRoot, FVector(0.f, -24.f, 44.f), FRotator(-6.f, 0.f, 0.f));
	FreeUpperArm = AddBone(TEXT("FreeUpperArm"), FreeShoulder, FVector(7.5f, 7.5f, 14.f));
	FreeElbow = AddJoint(TEXT("FreeElbow"), FreeShoulder, FVector(0.f, 0.f, -28.f));
	FreeForearm = AddBone(TEXT("FreeForearm"), FreeElbow, FVector(6.5f, 6.5f, 13.f));

	Flashlight = CreateDefaultSubobject<USpotLightComponent>(TEXT("Flashlight"));
	Flashlight->SetupAttachment(AimPivot);
	Flashlight->SetRelativeLocation(FVector(30.f, 14.f, 4.f));
	Flashlight->IntensityUnits = ELightUnits::Unitless;
	Flashlight->Intensity = 60000.f;
	Flashlight->AttenuationRadius = 3000.f;
	Flashlight->InnerConeAngle = 16.f;
	Flashlight->OuterConeAngle = 33.f;
	Flashlight->LightColor = FColor(255, 244, 219);
	Flashlight->CastShadows = true;
	Flashlight->SetVisibility(false);

	GetMesh()->SetVisibility(false);
	GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

USceneComponent* AVantageCharacter::AddJoint(const TCHAR* Name, USceneComponent* Parent, const FVector& Offset, const FRotator& Rotation)
{
	USceneComponent* Joint = CreateDefaultSubobject<USceneComponent>(Name);
	Joint->SetupAttachment(Parent);
	Joint->SetRelativeLocation(Offset);
	Joint->SetRelativeRotation(Rotation);
	return Joint;
}

UStaticMeshComponent* AVantageCharacter::AddBone(const TCHAR* Name, USceneComponent* Joint, const FVector& HalfExtent, const FVector& Offset)
{
	// Hung so its top edge sits on the joint's origin. That is what makes the
	// joint rotate the bone about its end rather than about its middle.
	return AddBodyPart(Name, Joint, Offset + FVector(0.f, 0.f, -HalfExtent.Z), HalfExtent, FRotator::ZeroRotator);
}

UStaticMeshComponent* AVantageCharacter::AddBodyPart(const TCHAR* Name, USceneComponent* Parent, const FVector& Location, const FVector& HalfExtent, const FRotator& Rotation)
{
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));

	UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
	Part->SetupAttachment(Parent);
	Part->SetRelativeLocation(Location);
	Part->SetRelativeRotation(Rotation);
	Part->SetRelativeScale3D(HalfExtent / MeshHalfSize);

	if (CubeFinder.Succeeded())
	{
		Part->SetStaticMesh(CubeFinder.Object);
	}

	// His own geometry must never block his own shot; the capsule handles bumping.
	Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	return Part;
}

void AVantageCharacter::PostInitializeComponents()
{
	Super::PostInitializeComponents();
	BuildInputBindings();
}

void AVantageCharacter::BeginPlay()
{
	Super::BeginPlay();

	Health = MaxHealth;

	auto Tint = [](UStaticMeshComponent* Part, const FLinearColor& Colour)
	{
		if (!Part)
		{
			return;
		}
		if (UMaterialInstanceDynamic* Material = Part->CreateAndSetMaterialInstanceDynamic(0))
		{
			Material->SetVectorParameterValue(TEXT("Color"), Colour);
		}
	};

	Tint(Torso, ShirtColour);
	Tint(Coat, CoatColour);
	Tint(Head, SkinColour);
	Tint(Hair, HairColour);
	Tint(Beard, HairColour);
	Tint(BeardTaper, HairColour);
	Tint(Moustache, HairColour);
	Tint(HatBrim, HatColour);
	Tint(HatCrown, HatColour);
	Tint(HatBand, BandColour);
	Tint(Collar, CoatColour);
	Tint(Belt, LeatherColour);
	Tint(LeftTail, CoatColour);
	Tint(RightTail, CoatColour);
	Tint(LeftThigh, TrouserColour);
	Tint(RightThigh, TrouserColour);
	Tint(LeftShin, TrouserColour);
	Tint(RightShin, TrouserColour);
	Tint(LeftFoot, BootColour);
	Tint(RightFoot, BootColour);
	Tint(GunUpperArm, CoatColour);
	Tint(GunForearm, SkinColour);
	Tint(FreeUpperArm, CoatColour);
	Tint(FreeForearm, SkinColour);

	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	Revolver = GetWorld()->SpawnActor<ARevolver>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
	if (Revolver)
	{
		Revolver->AttachToComponent(GunHand, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
		Revolver->SetActorRelativeLocation(FVector::ZeroVector);
		// The hand hangs down the arm's local -Z, so the gun needs pitching back
		// up to point along the arm rather than at the ground.
		Revolver->SetActorRelativeRotation(FRotator(90.f, 0.f, 0.f));
		Revolver->SetActorRelativeScale3D(FVector(1.3f));
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("Vantage: revolver failed to spawn; the player is unarmed."));
	}

	Dog = GetWorld()->SpawnActor<ARobotDog>(
		GetActorLocation() + FVector(-90.f, 70.f, -40.f), GetActorRotation(), SpawnParams);
	if (!Dog)
	{
		UE_LOG(LogTemp, Warning, TEXT("Vantage: robot dog failed to spawn."));
	}

	GetWorldTimerManager().SetTimer(FallCheckTimer, this, &AVantageCharacter::CheckForFall, 0.5f, true);
	GetWorldTimerManager().SetTimer(InputWatchdogTimer, this, &AVantageCharacter::ReportSilentInput, 8.f, false);
}

void AVantageCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	DamageFlash = FMath::Max(DamageFlash - DeltaSeconds * 1.6f, 0.f);
	HitMarker = FMath::Max(HitMarker - DeltaSeconds * 3.2f, 0.f);

	// Sprint only reads as sprinting when he is actually moving, so holding
	// shift while stood still does not widen the lens.
	const bool bReallySprinting = bSprinting && !bDown && !ActiveLock && GetVelocity().Size2D() > WalkSpeed * 0.6f;
	SprintBlend = FMath::FInterpTo(SprintBlend, bReallySprinting ? 1.f : 0.f, DeltaSeconds, 5.f);

	if (Camera)
	{
		const float TargetFOV = FMath::Lerp(BaseFieldOfView, SprintFieldOfView, SprintBlend);
		Camera->SetFieldOfView(FMath::FInterpTo(Camera->FieldOfView, TargetFOV, DeltaSeconds, 6.f));
	}

	// Drop the lock if he wanders out of reach of it.
	if (ActiveLock && FVector::Dist(GetActorLocation(), ActiveLock->GetActorLocation()) > UseRange * 1.6f)
	{
		ActiveLock->Disengage();
		ActiveLock = nullptr;
	}

	UpdateBody(DeltaSeconds);

	if (bDown)
	{
		return;
	}

	TimeSinceDamage += DeltaSeconds;
	if (TimeSinceDamage > RegenDelay && Health < MaxHealth)
	{
		Health = FMath::Min(Health + RegenPerSecond * DeltaSeconds, MaxHealth);
	}
}

void AVantageCharacter::UpdateBody(float DeltaSeconds)
{
	if (bDown)
	{
		const FRotator Slumped(78.f, 0.f, 12.f);
		BodyRoot->SetRelativeRotation(FMath::RInterpTo(BodyRoot->GetRelativeRotation(), Slumped, DeltaSeconds, 5.f));
		BodyRoot->SetRelativeLocation(FMath::VInterpTo(BodyRoot->GetRelativeLocation(), FVector(20.f, 0.f, -46.f), DeltaSeconds, 5.f));
		return;
	}

	const float Speed = GetVelocity().Size2D();
	const float Target = FMath::Clamp(Speed / FMath::Max(WalkSpeed, 1.f), 0.f, 1.8f);
	GaitBlend = FMath::FInterpTo(GaitBlend, Target, DeltaSeconds, 7.f);
	GaitPhase += DeltaSeconds * (5.2f + GaitBlend * 3.4f + SprintBlend * 3.f);

	const float Swing = FMath::Sin(GaitPhase) * GaitBlend;
	const float Stride = 30.f + 15.f * SprintBlend;

	// Hips lead, opposed. A positive pitch swings a hanging bone backwards.
	if (LeftHip && RightHip)
	{
		LeftHip->SetRelativeRotation(FRotator(Swing * Stride, 0.f, 0.f));
		RightHip->SetRelativeRotation(FRotator(-Swing * Stride, 0.f, 0.f));
	}

	// Knees only ever bend one way, and only on the recovery half of the stride -
	// clamping at zero is what stops the shin hinging forwards through the thigh.
	const float KneeMax = 46.f + 26.f * SprintBlend;
	const float LeftBend  = FMath::Max(0.f, -FMath::Sin(GaitPhase - 0.7f)) * KneeMax * GaitBlend;
	const float RightBend = FMath::Max(0.f, -FMath::Sin(GaitPhase - 0.7f + PI)) * KneeMax * GaitBlend;

	if (LeftKnee && RightKnee)
	{
		LeftKnee->SetRelativeRotation(FRotator(LeftBend, 0.f, 0.f));
		RightKnee->SetRelativeRotation(FRotator(RightBend, 0.f, 0.f));
	}

	// Boots counter the accumulated hip and knee angle so they stay near flat.
	if (LeftFoot && RightFoot)
	{
		LeftFoot->SetRelativeRotation(FRotator(-(Swing * Stride + LeftBend) * 0.65f, 0.f, 0.f));
		RightFoot->SetRelativeRotation(FRotator(-(-Swing * Stride + RightBend) * 0.65f, 0.f, 0.f));
	}

	// Free arm counter-swings the legs and pumps harder at a sprint.
	if (FreeShoulder && FreeElbow)
	{
		FreeShoulder->SetRelativeRotation(FRotator(-6.f - Swing * (24.f + 14.f * SprintBlend), 0.f, 0.f));
		FreeElbow->SetRelativeRotation(FRotator(10.f + FMath::Max(0.f, Swing) * (38.f + 30.f * SprintBlend), 0.f, 0.f));
	}

	// Gun arm stays on target; it only breathes with the stride.
	if (GunShoulder && GunElbow)
	{
		GunShoulder->SetRelativeRotation(FRotator(GunShoulderRest + Swing * 3.f, 0.f, 0.f));
		GunElbow->SetRelativeRotation(FRotator(12.f + Swing * 5.f, 0.f, 0.f));
	}

	// Lean into the run, and bob at twice the stride so both footfalls read.
	BodyRoot->SetRelativeRotation(FRotator(SprintBlend * 7.f, 0.f, 0.f));
	BodyRoot->SetRelativeLocation(FVector(0.f, 0.f, FMath::Abs(FMath::Sin(GaitPhase)) * 2.6f * GaitBlend));

	if (AimPivot && Controller)
	{
		const float AimPitch = FRotator::NormalizeAxis(Controller->GetControlRotation().Pitch);
		AimPivot->SetRelativeRotation(FRotator(AimPitch, 0.f, 0.f));
	}
}

void AVantageCharacter::BuildInputBindings()
{
	if (InputContext)
	{
		return;
	}

	InputContext = NewObject<UInputMappingContext>(this, TEXT("VantageInputContext"));

	auto MakeAction = [this](const TCHAR* Name, EInputActionValueType Type) -> UInputAction*
	{
		UInputAction* Action = NewObject<UInputAction>(this, Name);
		Action->ValueType = Type;
		return Action;
	};

	MoveAction       = MakeAction(TEXT("IA_Move"),       EInputActionValueType::Axis2D);
	LookAction       = MakeAction(TEXT("IA_Look"),       EInputActionValueType::Axis2D);
	LookRateAction   = MakeAction(TEXT("IA_LookRate"),   EInputActionValueType::Axis2D);
	JumpAction       = MakeAction(TEXT("IA_Jump"),       EInputActionValueType::Boolean);
	SprintAction     = MakeAction(TEXT("IA_Sprint"),     EInputActionValueType::Boolean);
	CrouchAction     = MakeAction(TEXT("IA_Crouch"),     EInputActionValueType::Boolean);
	FireAction       = MakeAction(TEXT("IA_Fire"),       EInputActionValueType::Boolean);
	ReloadAction     = MakeAction(TEXT("IA_Reload"),     EInputActionValueType::Boolean);
	FlashlightAction = MakeAction(TEXT("IA_Flashlight"), EInputActionValueType::Boolean);
	UseAction        = MakeAction(TEXT("IA_Use"),        EInputActionValueType::Boolean);
	DialUpAction     = MakeAction(TEXT("IA_DialUp"),     EInputActionValueType::Boolean);
	DialDownAction   = MakeAction(TEXT("IA_DialDown"),   EInputActionValueType::Boolean);
	DialLeftAction   = MakeAction(TEXT("IA_DialLeft"),   EInputActionValueType::Boolean);
	DialRightAction  = MakeAction(TEXT("IA_DialRight"),  EInputActionValueType::Boolean);

	// A key press lands on the X axis, so anything that should read as
	// forward/back needs swizzling into Y first, then negating if it points the
	// other way. Modifiers apply in array order.
	auto MapAxis = [this](UInputAction* Action, const FKey& Key, bool bSwizzleToY, bool bNegate)
	{
		FEnhancedActionKeyMapping& Mapping = InputContext->MapKey(Action, Key);
		if (bSwizzleToY)
		{
			UInputModifierSwizzleAxis* Swizzle = NewObject<UInputModifierSwizzleAxis>(InputContext);
			Swizzle->Order = EInputAxisSwizzle::YXZ;
			Mapping.Modifiers.Add(Swizzle);
		}
		if (bNegate)
		{
			Mapping.Modifiers.Add(NewObject<UInputModifierNegate>(InputContext));
		}
	};

	MapAxis(MoveAction, EKeys::W, /*Swizzle*/ true,  /*Negate*/ false);
	MapAxis(MoveAction, EKeys::S, /*Swizzle*/ true,  /*Negate*/ true);
	MapAxis(MoveAction, EKeys::D, /*Swizzle*/ false, /*Negate*/ false);
	MapAxis(MoveAction, EKeys::A, /*Swizzle*/ false, /*Negate*/ true);
	MapAxis(MoveAction, EKeys::Up,    true,  false);
	MapAxis(MoveAction, EKeys::Down,  true,  true);
	MapAxis(MoveAction, EKeys::Right, false, false);
	MapAxis(MoveAction, EKeys::Left,  false, true);
	MapAxis(MoveAction, EKeys::Gamepad_LeftX, false, false);
	MapAxis(MoveAction, EKeys::Gamepad_LeftY, true,  false);

	InputContext->MapKey(LookAction, EKeys::Mouse2D);
	MapAxis(LookRateAction, EKeys::Gamepad_RightX, false, false);
	MapAxis(LookRateAction, EKeys::Gamepad_RightY, true,  false);

	InputContext->MapKey(JumpAction, EKeys::SpaceBar);
	InputContext->MapKey(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
	InputContext->MapKey(SprintAction, EKeys::LeftShift);
	InputContext->MapKey(SprintAction, EKeys::Gamepad_LeftShoulder);
	InputContext->MapKey(CrouchAction, EKeys::LeftControl);
	InputContext->MapKey(CrouchAction, EKeys::C);
	InputContext->MapKey(CrouchAction, EKeys::Gamepad_FaceButton_Right);
	InputContext->MapKey(FireAction, EKeys::LeftMouseButton);
	InputContext->MapKey(FireAction, EKeys::Gamepad_RightTrigger);
	InputContext->MapKey(ReloadAction, EKeys::R);
	InputContext->MapKey(FlashlightAction, EKeys::F);
	InputContext->MapKey(FlashlightAction, EKeys::Gamepad_FaceButton_Top);
	InputContext->MapKey(UseAction, EKeys::E);
	InputContext->MapKey(UseAction, EKeys::Gamepad_FaceButton_Left);

	// The dial keys double as the movement keys. Enhanced Input is happy to fire
	// both; the handlers below do nothing unless a lock is actually open, and
	// Move() bails out while one is.
	InputContext->MapKey(DialUpAction, EKeys::W);
	InputContext->MapKey(DialUpAction, EKeys::Up);
	InputContext->MapKey(DialDownAction, EKeys::S);
	InputContext->MapKey(DialDownAction, EKeys::Down);
	InputContext->MapKey(DialLeftAction, EKeys::A);
	InputContext->MapKey(DialLeftAction, EKeys::Left);
	InputContext->MapKey(DialRightAction, EKeys::D);
	InputContext->MapKey(DialRightAction, EKeys::Right);
}

void AVantageCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	BuildInputBindings();

	const APlayerController* PC = Cast<APlayerController>(GetController());
	UEnhancedInputLocalPlayerSubsystem* Subsystem = PC
		? ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer())
		: nullptr;

	if (Subsystem)
	{
		Subsystem->AddMappingContext(InputContext, 0);
	}
	else
	{
		UE_LOG(LogTemp, Error,
			TEXT("Vantage: no EnhancedInputLocalPlayerSubsystem. Check that DefaultPlayerInputClass ")
			TEXT("in Config/DefaultInput.ini is /Script/EnhancedInput.EnhancedPlayerInput."));
	}

	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input)
	{
		UE_LOG(LogTemp, Error,
			TEXT("Vantage: pawn was given a plain UInputComponent. Set DefaultInputComponentClass ")
			TEXT("in Config/DefaultInput.ini to /Script/EnhancedInput.EnhancedInputComponent."));
		return;
	}

	Input->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AVantageCharacter::Move);
	Input->BindAction(LookAction, ETriggerEvent::Triggered, this, &AVantageCharacter::Look);
	Input->BindAction(LookRateAction, ETriggerEvent::Triggered, this, &AVantageCharacter::LookRate);
	Input->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
	Input->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
	Input->BindAction(SprintAction, ETriggerEvent::Started, this, &AVantageCharacter::StartSprint);
	Input->BindAction(SprintAction, ETriggerEvent::Completed, this, &AVantageCharacter::StopSprint);
	Input->BindAction(CrouchAction, ETriggerEvent::Started, this, &AVantageCharacter::ToggleCrouch);
	Input->BindAction(FireAction, ETriggerEvent::Started, this, &AVantageCharacter::FireWeapon);
	Input->BindAction(ReloadAction, ETriggerEvent::Started, this, &AVantageCharacter::ReloadWeapon);
	Input->BindAction(FlashlightAction, ETriggerEvent::Started, this, &AVantageCharacter::ToggleFlashlight);
	Input->BindAction(UseAction, ETriggerEvent::Started, this, &AVantageCharacter::UseOrConfirm);
	Input->BindAction(DialUpAction, ETriggerEvent::Started, this, &AVantageCharacter::DialUp);
	Input->BindAction(DialDownAction, ETriggerEvent::Started, this, &AVantageCharacter::DialDown);
	Input->BindAction(DialLeftAction, ETriggerEvent::Started, this, &AVantageCharacter::DialLeft);
	Input->BindAction(DialRightAction, ETriggerEvent::Started, this, &AVantageCharacter::DialRight);
}

void AVantageCharacter::Move(const FInputActionValue& Value)
{
	bReceivedAnyInput = true;

	const FVector2D Axis = Value.Get<FVector2D>();
	if (!Controller || bDown || ActiveLock || Axis.IsNearlyZero())
	{
		return;
	}

	const FRotator YawOnly(0.f, Controller->GetControlRotation().Yaw, 0.f);
	const FRotationMatrix YawFrame(YawOnly);

	AddMovementInput(YawFrame.GetUnitAxis(EAxis::X), Axis.Y);
	AddMovementInput(YawFrame.GetUnitAxis(EAxis::Y), Axis.X);
}

void AVantageCharacter::Look(const FInputActionValue& Value)
{
	bReceivedAnyInput = true;

	if (ActiveLock)
	{
		return;
	}

	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X * MouseSensitivity);
	AddControllerPitchInput(-Axis.Y * MouseSensitivity);
}

void AVantageCharacter::LookRate(const FInputActionValue& Value)
{
	if (ActiveLock)
	{
		return;
	}

	const FVector2D Axis = Value.Get<FVector2D>();
	const float Delta = GetWorld() ? GetWorld()->GetDeltaSeconds() : 0.f;

	AddControllerYawInput(Axis.X * GamepadLookRate * Delta);
	AddControllerPitchInput(-Axis.Y * GamepadLookRate * Delta);
}

void AVantageCharacter::StartSprint()
{
	bSprinting = true;
	GetCharacterMovement()->MaxWalkSpeed = SprintSpeed;
}

void AVantageCharacter::StopSprint()
{
	bSprinting = false;
	GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;
}

void AVantageCharacter::ToggleCrouch()
{
	if (ActiveLock)
	{
		return;
	}

	if (bIsCrouched)
	{
		UnCrouch();
	}
	else
	{
		Crouch();
	}
}

void AVantageCharacter::ToggleFlashlight()
{
	if (Flashlight)
	{
		Flashlight->ToggleVisibility();
	}
}

// ---------------------------------------------------------------------------
// the lock
// ---------------------------------------------------------------------------

ACodeLock* AVantageCharacter::FindLockInReach() const
{
	ACodeLock* Best = nullptr;
	float BestDistanceSquared = UseRange * UseRange;

	for (TActorIterator<ACodeLock> It(GetWorld()); It; ++It)
	{
		const float DistanceSquared = FVector::DistSquared(GetActorLocation(), It->GetActorLocation());
		if (DistanceSquared < BestDistanceSquared)
		{
			BestDistanceSquared = DistanceSquared;
			Best = *It;
		}
	}

	return Best;
}

FText AVantageCharacter::GetReachPrompt() const
{
	if (ActiveLock)
	{
		return FText::GetEmpty();
	}

	if (const ACodeLock* Lock = FindLockInReach())
	{
		return Lock->IsOpen()
			? FText::FromString(TEXT("Unlocked"))
			: FText::FromString(TEXT("[E]  Work the lock"));
	}

	return FText::GetEmpty();
}

void AVantageCharacter::UseOrConfirm()
{
	bReceivedAnyInput = true;

	if (bDown)
	{
		return;
	}

	if (ActiveLock)
	{
		if (ActiveLock->Submit())
		{
			// Solved. Step back automatically rather than leaving him staring
			// at an open lock with the controls still captured.
			ActiveLock->Disengage();
			ActiveLock = nullptr;
		}
		return;
	}

	ACodeLock* Lock = FindLockInReach();
	if (Lock && !Lock->IsOpen())
	{
		ActiveLock = Lock;
		Lock->Engage();
		GetCharacterMovement()->StopMovementImmediately();
	}
}

void AVantageCharacter::CancelLock()
{
	if (ActiveLock)
	{
		ActiveLock->Disengage();
		ActiveLock = nullptr;
	}
}

void AVantageCharacter::DialUp()    { if (ActiveLock) { ActiveLock->NudgeDigit(1); } }
void AVantageCharacter::DialDown()  { if (ActiveLock) { ActiveLock->NudgeDigit(-1); } }
void AVantageCharacter::DialLeft()  { if (ActiveLock) { ActiveLock->MoveCursor(-1); } }
void AVantageCharacter::DialRight() { if (ActiveLock) { ActiveLock->MoveCursor(1); } }

// ---------------------------------------------------------------------------
// shooting
// ---------------------------------------------------------------------------

void AVantageCharacter::FireWeapon()
{
	bReceivedAnyInput = true;

	if (bDown || ActiveLock || !Revolver)
	{
		return;
	}

	if (!Revolver->Fire())
	{
		if (Revolver->IsEmpty())
		{
			Revolver->BeginReload();
		}
		return;
	}

	AddControllerPitchInput(-Revolver->RecoilPitch);
	ResolveShot();
}

void AVantageCharacter::ResolveShot()
{
	const APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC)
	{
		return;
	}

	FVector ViewLocation;
	FRotator ViewRotation;
	PC->GetPlayerViewPoint(ViewLocation, ViewRotation);

	FCollisionQueryParams Params(SCENE_QUERY_STAT(VantageShot), true, this);
	Params.AddIgnoredActor(this);
	if (Revolver)
	{
		Params.AddIgnoredActor(Revolver);
	}
	if (Dog)
	{
		Params.AddIgnoredActor(Dog);
	}

	FHitResult Hit;
	const bool bHit = GetWorld()->LineTraceSingleByChannel(
		Hit,
		ViewLocation,
		ViewLocation + ViewRotation.Vector() * ShotRange,
		ECC_Visibility,
		Params);

	if (!bHit)
	{
		return;
	}

	AZombieCharacter* Zombie = Cast<AZombieCharacter>(Hit.GetActor());
	if (!Zombie || Zombie->IsDead())
	{
		return;
	}

	const bool bHeadshot = Hit.Component.IsValid() && Hit.Component->ComponentHasTag(AZombieCharacter::HeadTag);
	Zombie->ApplyHit(BodyDamage, bHeadshot);

	bLastHitHeadshot = bHeadshot;
	HitMarker = 1.f;
}

void AVantageCharacter::ReloadWeapon()
{
	bReceivedAnyInput = true;

	// Doubles as the way out of a lock, which is why it checks that first.
	if (ActiveLock)
	{
		CancelLock();
		return;
	}

	if (!bDown && Revolver)
	{
		Revolver->BeginReload();
	}
}

// ---------------------------------------------------------------------------
// damage
// ---------------------------------------------------------------------------

void AVantageCharacter::TakeZombieHit(float Damage)
{
	if (bDown)
	{
		return;
	}

	Health = FMath::Max(Health - Damage, 0.f);
	TimeSinceDamage = 0.f;
	DamageFlash = 1.f;

	// Being mauled is not the moment to be fiddling with a combination.
	CancelLock();

	if (Health <= 0.f)
	{
		bDown = true;
		GetCharacterMovement()->StopMovementImmediately();

		if (AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
		{
			GameMode->NotifyPlayerDown();
		}
	}
}

void AVantageCharacter::Revive(const FVector& At)
{
	bDown = false;
	Health = MaxHealth;
	TimeSinceDamage = 0.f;
	DamageFlash = 0.f;

	CancelLock();
	GetCharacterMovement()->StopMovementImmediately();
	SetActorLocation(At, false, nullptr, ETeleportType::TeleportPhysics);

	if (Revolver)
	{
		Revolver->BeginReload();
	}
	if (Dog)
	{
		Dog->SetActorLocation(At + FVector(-90.f, 70.f, 0.f), false, nullptr, ETeleportType::TeleportPhysics);
	}
}

void AVantageCharacter::CheckForFall()
{
	if (GetActorLocation().Z > FallRecoveryZ)
	{
		return;
	}

	FVector Recovery(0.f, -230.f, 140.f);
	if (const AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
	{
		Recovery = GameMode->GetSpawnLocation();
	}

	UE_LOG(LogTemp, Warning,
		TEXT("Vantage: player fell out of the level and was returned to %s."),
		*Recovery.ToCompactString());

	GetCharacterMovement()->StopMovementImmediately();
	SetActorLocation(Recovery, false, nullptr, ETeleportType::TeleportPhysics);
}

void AVantageCharacter::ReportSilentInput()
{
	if (bReceivedAnyInput)
	{
		return;
	}

	UE_LOG(LogTemp, Warning,
		TEXT("Vantage: no input received in the first 8 seconds. If nothing responds, check that ")
		TEXT("Config/DefaultInput.ini sets DefaultPlayerInputClass and DefaultInputComponentClass ")
		TEXT("to the EnhancedInput versions, and that the EnhancedInput plugin is enabled."));
}
