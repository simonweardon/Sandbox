#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Revolver.generated.h"

class UPointLightComponent;
class UStaticMeshComponent;

/**
 * The six shooter in the player's hand.
 *
 * Owns ammo, the reload timer and all the visual feedback - recoil kick, muzzle
 * flash, chamber spin. It deliberately does not trace or deal damage: the
 * character owns the camera, so the character owns the shot. This class only
 * answers whether a round was available.
 *
 * Modelled at roughly life size, about 23cm from hammer to muzzle, out of the
 * engine primitive meshes.
 */
UCLASS()
class VANTAGE_API ARevolver : public AActor
{
	GENERATED_BODY()

public:
	ARevolver();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Consumes a round. False when empty or mid-reload, and nothing happens. */
	bool Fire();

	/** Starts a reload. Ignored when already full or already reloading. */
	void BeginReload();

	int32 GetAmmo() const { return Ammo; }
	int32 GetCapacity() const { return Capacity; }
	bool IsReloading() const { return bReloading; }
	bool IsEmpty() const { return Ammo <= 0; }

	/** 0 to 1 through the reload, for the HUD to draw a progress arc. */
	float GetReloadProgress() const;

	/** World-space point the shot should appear to come from. */
	FVector GetMuzzleLocation() const;

	/** How far the last shot kicked the view, in degrees. */
	UPROPERTY(EditDefaultsOnly, Category = "Revolver")
	float RecoilPitch = 2.4f;

	UPROPERTY(EditDefaultsOnly, Category = "Revolver")
	int32 Capacity = 6;

	UPROPERTY(EditDefaultsOnly, Category = "Revolver")
	float ReloadSeconds = 2.1f;

private:
	/** Builds one part of the gun. Local space, gun pointing down +X. */
	UStaticMeshComponent* AddPart(const TCHAR* Name, UStaticMesh* Mesh, const FVector& Location, const FVector& Scale, const FRotator& Rotation);

	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<USceneComponent> Pivot;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<USceneComponent> Muzzle;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UStaticMeshComponent> Frame;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UStaticMeshComponent> Chamber;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UStaticMeshComponent> Barrel;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UStaticMeshComponent> Rib;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UStaticMeshComponent> FrontSight;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UStaticMeshComponent> Grip;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UStaticMeshComponent> Hammer;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UStaticMeshComponent> TriggerGuard;
	UPROPERTY(VisibleAnywhere, Category = "Revolver") TObjectPtr<UPointLightComponent> MuzzleFlash;

	int32 Ammo = 6;
	bool bReloading = false;
	float ReloadElapsed = 0.f;

	/** 1 right after a shot, decaying to 0. Drives the kick and the flash. */
	float Recoil = 0.f;
	float FlashTimer = 0.f;

	FVector RestLocation = FVector::ZeroVector;
};
